package com.example.clearkyc.analysis;

import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.KybCaseRepository;
import com.example.clearkyc.web.dto.FieldRecord;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.content.Media;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.HashMap;
import java.util.Map;

import org.springframework.http.codec.ServerSentEvent;

@Service
public class ExtractionService {

    private static final Logger log = LoggerFactory.getLogger(ExtractionService.class);
    private static final int MAX_LINE_BYTES = 512_000;

    private static final String SYSTEM_PROMPT = """
            You are a KYB (Know Your Business) analyst assistant.
            Extract structured entities from the PDF document provided.

            Emit one JSON line per extracted field, immediately when found (do not wait for full document):
            {"fieldName":"<name>","value":"<value>","citations":[{"quote":"<verbatim text>","page":<n>}]}

            Fields to extract:
            - "companyName": registered name of the company
            - "directors[0].name", "directors[1].name", ...: full names of directors/board members
            - "ubos[0].name", "ubos[0].ownershipPercentage", "ubos[1].name", ...: ultimate beneficial owners

            If a field cannot be found: {"fieldName":"<name>","value":"Not Disclosed / Inferred Missing","citations":[]}

            Rules:
            - Emit exactly one JSON object per line. Use only \\n as separator.
            - Do not emit markdown, code blocks, or any text outside of JSON lines.
            - "quote" must be verbatim text from the document (copy-paste, not paraphrase).
            - "page" is best-effort (0 if unknown).

            After ALL field lines, emit red flags (one JSON line each):
            {"category":"<CATEGORY>","description":"<sentence>","citations":[{"quote":"<text>","page":<n>}]}

            Available categories: SANCTIONS_EXPOSURE, SHELL_COMPANY_INDICATORS, JURISDICTION_RISK,
            OPAQUE_OWNERSHIP, PEP_LINKAGE, SECTOR_SPECIFIC_RISK

            Write the red flag "description" in Polish, regardless of the source document's language.
            "quote" inside citations must stay verbatim in the document's original language — never translate a quote.

            Emit red flag lines ONLY after all field lines. If no red flags: emit nothing (no red flag lines).
            A "Not Disclosed / Inferred Missing" field value MAY chain into a red flag — use your judgment.
            """;

    private final ChatModel chatModel;
    private final KybCaseRepository caseRepository;
    private final JsonMapper jsonMapper;

    public ExtractionService(ChatModel chatModel, KybCaseRepository caseRepository, JsonMapper jsonMapper) {
        this.chatModel = chatModel;
        this.caseRepository = caseRepository;
        this.jsonMapper = jsonMapper;
    }

    public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(UUID caseId, MultipartFile pdfFile, String analystIdentity) {
        return Flux.defer(() -> {
            KybCase kybCase = caseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            // Block concurrent runs and locked cases; allow re-analysis from ANALYZED state.
            if (kybCase.getStatus() == CaseStatus.ANALYZING) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Analysis already in progress");
            }
            if (kybCase.getStatus() == CaseStatus.LOCKED) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Case is locked — no further analysis allowed");
            }
            byte[] pdfBytes;
            try {
                pdfBytes = pdfFile.getBytes();
            } catch (Exception e) {
                return Flux.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to read PDF"));
            }

            kybCase.setStatus(CaseStatus.ANALYZING);
            caseRepository.save(kybCase);

            Media pdfMedia = Media.builder()
                    .mimeType(MimeTypeUtils.parseMimeType("application/pdf"))
                    .data(new ByteArrayResource(pdfBytes))
                    .name("document.pdf")
                    .build();

            UserMessage userMessage = UserMessage.builder()
                    .text("Extract KYB entities from this document.")
                    .media(pdfMedia)
                    .build();
            SystemMessage systemMessage = new SystemMessage(SYSTEM_PROMPT);
            Prompt prompt = new Prompt(List.of(systemMessage, userMessage));

            AtomicReference<StringBuilder> buf = new AtomicReference<>(new StringBuilder());
            AtomicBoolean hadError = new AtomicBoolean(false);
            AtomicReference<List<RedFlagItem>> accumulatedFlags = new AtomicReference<>(new ArrayList<>());
            AtomicReference<List<FieldRecord>> accumulatedFields = new AtomicReference<>(new ArrayList<>());

            Flux<ExtractionEvent> eventFlux = chatModel.stream(prompt)
                    .mapNotNull(r -> r.getResult() != null ? r.getResult().getOutput().getText() : null)
                    .flatMapIterable(token -> {
                        var sb = buf.get();
                        sb.append(token);
                        if (sb.length() > MAX_LINE_BYTES) {
                            throw new IllegalStateException("LLM response line exceeded buffer limit — unexpected response format");
                        }
                        String s = sb.toString();
                        int nl = s.lastIndexOf('\n');
                        if (nl < 0) return List.of();
                        List<String> lines = Arrays.asList(s.substring(0, nl).split("\n"));
                        buf.set(new StringBuilder(s.substring(nl + 1)));
                        return lines.stream().filter(l -> !l.isBlank()).toList();
                    })
                    .mapNotNull(line -> {
                        try {
                            if (classifyLine(line, jsonMapper) == LineKind.RED_FLAG) {
                                RedFlagItem flag = jsonMapper.readValue(line, RedFlagItem.class);
                                accumulatedFlags.get().add(flag);
                                return null;
                            }
                            FieldRecord field = jsonMapper.readValue(line, FieldRecord.class);
                            accumulatedFields.get().add(field);
                            // Convert FieldRecord to FieldExtracted for SSE event
                            var citations = field.citations() != null 
                                ? field.citations().stream()
                                    .map(c -> new Citation(c.quote(), c.page()))
                                    .toList()
                                : List.<Citation>of();
                            return (ExtractionEvent) new ExtractionEvent.FieldExtracted(
                                field.fieldName(), field.value(), citations);
                        } catch (Exception e) {
                            log.warn("Skipping unparseable NDJSON line: {}", line);
                            return null;
                        }
                    })
                    .concatWith(Flux.defer(() -> {
                        List<RedFlagItem> flags = accumulatedFlags.get();
                        ExtractionEvent complete = new ExtractionEvent.AnalysisComplete(caseId.toString());
                        if (flags.isEmpty()) return Flux.just(complete);
                        return Flux.just(new ExtractionEvent.RedFlagsFound(flags), complete);
                    }))
                    .onErrorResume(e -> {
                        hadError.set(true);
                        return Flux.just(new ExtractionEvent.AnalysisError("EXTRACTION_ERROR", e.getMessage()));
                    })
                    // On error: revert to CREATED so analyst can re-submit; on success: ANALYZED
                    .doFinally(s -> {
                        if (!hadError.get()) {
                            // Save extraction data for ANALYZED cases
                            try {
                                Map<String, Object> extractionPayload = new HashMap<>();
                                extractionPayload.put("fields", accumulatedFields.get());
                                extractionPayload.put("red_flags", accumulatedFlags.get());
                                String jsonPayload = jsonMapper.writeValueAsString(extractionPayload);
                                kybCase.setExtractionData(jsonPayload);
                            } catch (Exception e) {
                                log.warn("Failed to serialize extraction data for case {}: {}", kybCase.getId(), e.getMessage());
                            }
                        }
                        kybCase.setStatus(hadError.get() ? CaseStatus.CREATED : CaseStatus.ANALYZED);
                        caseRepository.save(kybCase);
                    });

            return eventFlux.map(event ->
                    ServerSentEvent.<ExtractionEvent>builder()
                            .event(wireType(event))
                            .data(event)
                            .build()
            );
        });
    }

    enum LineKind { FIELD, RED_FLAG }

    /**
     * Discriminates a raw NDJSON line by its top-level key ("category" vs "fieldName"),
     * not by substring search over the raw text — a field value that legally contains
     * the literal text {@code "category":} must not be misrouted to red-flag parsing.
     */
    static LineKind classifyLine(String line, JsonMapper jsonMapper) {
        JsonNode node = jsonMapper.readTree(line);
        if (node.has("category")) {
            return LineKind.RED_FLAG;
        }
        if (node.has("fieldName")) {
            return LineKind.FIELD;
        }
        throw new IllegalArgumentException("Unrecognized NDJSON line shape: " + line);
    }

    static String wireType(ExtractionEvent event) {
        return switch (event) {
            case ExtractionEvent.FieldExtracted e -> "FieldExtracted";
            case ExtractionEvent.AnalysisComplete e -> "AnalysisComplete";
            case ExtractionEvent.AnalysisError e -> "AnalysisError";
            case ExtractionEvent.RedFlagsFound e -> "RedFlagsFound";
        };
    }
}
