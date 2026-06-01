package com.example.clearkyc.analysis;

import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.KybCaseRepository;
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

import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.http.codec.ServerSentEvent;

@Service
public class ExtractionService {

    private static final Logger log = LoggerFactory.getLogger(ExtractionService.class);

    private static final String SYSTEM_PROMPT = """
            You are a KYB (Know Your Business) analyst assistant.
            Extract structured entities from the PDF document provided.

            Emit one JSON line per extracted field, immediately when found (do not wait for full document):
            {"fieldName":"<name>","value":"<value>","citations":[{"quote":"<verbatim text>","pageNumber":<n>}]}

            Fields to extract:
            - "companyName": registered name of the company
            - "directors[0].name", "directors[1].name", ...: full names of directors/board members
            - "ubos[0].name", "ubos[0].ownershipPercentage", "ubos[1].name", ...: ultimate beneficial owners

            If a field cannot be found: {"fieldName":"<name>","value":"Not Disclosed / Inferred Missing","citations":[]}

            Rules:
            - Emit exactly one JSON object per line. Use only \\n as separator.
            - Do not emit markdown, code blocks, or any text outside of JSON lines.
            - "quote" must be verbatim text from the document (copy-paste, not paraphrase).
            - "pageNumber" is best-effort (0 if unknown).
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
            KybCase kybCase = caseRepository.findById(caseId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
            if (kybCase.getStatus() != CaseStatus.CREATED) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Case must be in CREATED state");
            }
            kybCase.setStatus(CaseStatus.ANALYZING);
            caseRepository.save(kybCase);

            byte[] pdfBytes;
            try {
                pdfBytes = pdfFile.getBytes();
            } catch (Exception e) {
                return Flux.error(new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to read PDF"));
            }

            Media pdfMedia = Media.builder()
                    .mimeType(MimeTypeUtils.parseMimeType("application/pdf"))
                    .data(new ByteArrayResource(pdfBytes))
                    .name(pdfFile.getOriginalFilename())
                    .build();

            UserMessage userMessage = UserMessage.builder()
                    .text("Extract KYB entities from this document.")
                    .media(pdfMedia)
                    .build();
            SystemMessage systemMessage = new SystemMessage(SYSTEM_PROMPT);
            Prompt prompt = new Prompt(List.of(systemMessage, userMessage));

            AtomicReference<StringBuilder> buf = new AtomicReference<>(new StringBuilder());

            Flux<ExtractionEvent> eventFlux = chatModel.stream(prompt)
                    .mapNotNull(r -> r.getResult() != null ? r.getResult().getOutput().getText() : null)
                    .flatMapIterable(token -> {
                        buf.get().append(token);
                        String s = buf.get().toString();
                        int nl = s.lastIndexOf('\n');
                        if (nl < 0) return List.of();
                        List<String> lines = Arrays.asList(s.substring(0, nl).split("\n"));
                        buf.set(new StringBuilder(s.substring(nl + 1)));
                        return lines.stream().filter(l -> !l.isBlank()).toList();
                    })
                    .mapNotNull(line -> {
                        try {
                            return (ExtractionEvent) jsonMapper.readValue(line, ExtractionEvent.FieldExtracted.class);
                        } catch (Exception e) {
                            log.warn("Skipping unparseable NDJSON line: {}", line);
                            return null;
                        }
                    })
                    .concatWith(Flux.just(new ExtractionEvent.AnalysisComplete(caseId.toString())))
                    .onErrorResume(e -> Flux.just(new ExtractionEvent.AnalysisError("EXTRACTION_ERROR", e.getMessage())))
                    .doFinally(s -> {
                        kybCase.setStatus(CaseStatus.ANALYZED);
                        caseRepository.save(kybCase);
                    });

            return eventFlux.map(event ->
                    ServerSentEvent.<ExtractionEvent>builder()
                            .event(event.getClass().getSimpleName())
                            .data(event)
                            .build()
            );
        });
    }
}
