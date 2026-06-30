package com.example.clearkyc.service;

import com.example.clearkyc.domain.AuditRecord;
import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.AuditRecordRepository;
import com.example.clearkyc.repository.KybCaseRepository;
import com.example.clearkyc.web.dto.FinalizeRequest;
import com.example.clearkyc.web.dto.FinalizeResponse;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class FinalizeService {

    // TODO(json-schema-validator-jackson3): remove bare ObjectMapper once networknt adds Jackson 3.x support.
    // Spring Boot 4 exposes a tools.jackson (3.x) bean incompatible with networknt's 2.x API.
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final KybCaseRepository kybCaseRepository;
    private final AuditRecordRepository auditRecordRepository;
    private JsonSchema jsonSchema;

    public FinalizeService(KybCaseRepository kybCaseRepository,
                           AuditRecordRepository auditRecordRepository) {
        this.kybCaseRepository = kybCaseRepository;
        this.auditRecordRepository = auditRecordRepository;
    }

    @PostConstruct
    void loadSchema() throws IOException {
        ClassPathResource resource = new ClassPathResource("schema/finalization-v0.3.json");
        try (InputStream is = resource.getInputStream()) {
            JsonSchemaFactory factory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7);
            jsonSchema = factory.getSchema(is);
        }
    }

    @Transactional
    public FinalizeResponse finalize(UUID caseId, FinalizeRequest request, String analystIdentity) {
        KybCase kybCase = kybCaseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));

        if (kybCase.getStatus() == CaseStatus.LOCKED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Case is already locked");
        }

        Instant now = Instant.now();

        Map<String, Object> payloadMap = new LinkedHashMap<>();
        payloadMap.put("caseId", caseId.toString());
        payloadMap.put("analystIdentity", analystIdentity);
        payloadMap.put("decision", request.decision().name());
        payloadMap.put("finalizedAt", now.toString());
        payloadMap.put("fields", request.fields());
        if (request.red_flags() != null) {
            payloadMap.put("red_flags", request.red_flags());
        }

        JsonNode payloadNode = objectMapper.valueToTree(payloadMap);
        Set<ValidationMessage> errors = jsonSchema.validate(payloadNode);
        if (!errors.isEmpty()) {
            String errorMsg = errors.stream()
                    .map(ValidationMessage::getMessage)
                    .collect(Collectors.joining("; "));
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Schema validation failed: " + errorMsg);
        }

        String payloadJson;
        try {
            payloadJson = objectMapper.writeValueAsString(payloadMap);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize payload");
        }

        // Single transaction: AuditRecord saved first, then KybCase mutated.
        // Do NOT move AuditRecord to a nested REQUIRES_NEW transaction — that would break atomicity.
        AuditRecord auditRecord = new AuditRecord(kybCase, analystIdentity, request.decision(), payloadJson);
        auditRecordRepository.save(auditRecord);

        kybCase.setStatus(CaseStatus.LOCKED);
        kybCase.setLockedAt(now);
        // JPA dirty-checking flushes KybCase mutation at commit — no explicit save needed.

        return new FinalizeResponse(auditRecord.getId(), request.decision().name(), now);
    }
}
