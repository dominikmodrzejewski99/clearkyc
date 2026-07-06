package com.example.clearkyc.service;

import com.example.clearkyc.analysis.RedFlagItem;
import com.example.clearkyc.domain.AuditRecord;
import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.DecisionType;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.AuditRecordRepository;
import com.example.clearkyc.repository.KybCaseRepository;
import com.example.clearkyc.web.dto.AuditSummary;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import com.example.clearkyc.web.dto.CaseSummaryResponse;
import com.example.clearkyc.web.dto.CreateCaseResponse;
import com.example.clearkyc.web.dto.FieldRecord;
import com.example.clearkyc.web.dto.UpdateCaseRequest;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class CaseService {

    private static final Logger log = LoggerFactory.getLogger(CaseService.class);

    // TODO(json-schema-validator-jackson3): remove bare ObjectMapper once networknt adds Jackson 3.x support.
    // Spring Boot 4 exposes a tools.jackson (3.x) bean incompatible with the 2.x API used to write this payload.
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final KybCaseRepository kybCaseRepository;
    private final AuditRecordRepository auditRecordRepository;

    public CaseService(KybCaseRepository kybCaseRepository, AuditRecordRepository auditRecordRepository) {
        this.kybCaseRepository = kybCaseRepository;
        this.auditRecordRepository = auditRecordRepository;
    }

    @Transactional
    public CaseDetailResponse updateCase(UUID caseId, UpdateCaseRequest request, String analystIdentity) {
        KybCase kybCase = kybCaseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));
        if (kybCase.getStatus() == CaseStatus.LOCKED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Locked cases cannot be modified");
        }
        kybCase.setEntityName(request.entityName());
        kybCaseRepository.save(kybCase);
        return new CaseDetailResponse(
                kybCase.getId(),
                kybCase.getStatus().name(),
                kybCase.getCreatedAt(),
                kybCase.getUpdatedAt(),
                kybCase.getLockedAt(),
                null,
                kybCase.getEntityName(),
                null,
                null);
    }

    @Transactional
    public void deleteCase(UUID caseId, String analystIdentity) {
        KybCase kybCase = kybCaseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));
        if (kybCase.getStatus() != CaseStatus.CREATED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only cases in CREATED state can be deleted");
        }
        kybCaseRepository.delete(kybCase);
    }

    @Transactional(readOnly = true)
    public List<CaseSummaryResponse> listCases(String analystIdentity) {
        return kybCaseRepository.findCaseSummaryRows(analystIdentity).stream()
                .map(row -> new CaseSummaryResponse(
                        (UUID) row[0],
                        ((CaseStatus) row[1]).name(),
                        (Instant) row[2],
                        (String) row[3],
                        row[4] == null ? null : ((DecisionType) row[4]).name()))
                .toList();
    }

    public CreateCaseResponse createCase(String entityName, byte[] pdfData, String analystIdentity) {
        KybCase kybCase = new KybCase(CaseStatus.CREATED, entityName, analystIdentity);
        kybCase.setPdfData(pdfData);
        kybCaseRepository.save(kybCase);
        return new CreateCaseResponse(kybCase.getId(), kybCase.getStatus().name(), kybCase.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public byte[] getPdfData(UUID caseId, String analystIdentity) {
        return kybCaseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                .map(KybCase::getPdfData)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));
    }

    @Transactional(readOnly = true)
    public CaseDetailResponse getCase(UUID caseId, String analystIdentity) {
        KybCase kybCase = kybCaseRepository.findByIdAndAnalystIdentity(caseId, analystIdentity)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));

        AuditSummary audit = null;
        List<FieldRecord> fields = null;
        List<RedFlagItem> redFlags = null;
        
        if (kybCase.getStatus() == CaseStatus.LOCKED) {
            AuditRecord auditRecord = auditRecordRepository.findByKybCase(kybCase).orElse(null);
            if (auditRecord != null) {
                audit = new AuditSummary(auditRecord.getId(), auditRecord.getDecision().name(), auditRecord.getFinalizedAt());
                PayloadFields payloadFields = parsePayload(caseId, auditRecord.getPayload());
                fields = payloadFields.fields();
                redFlags = payloadFields.redFlags();
            }
        } else if (kybCase.getStatus() == CaseStatus.ANALYZED && kybCase.getExtractionData() != null) {
            // Load extraction data for ANALYZED cases
            PayloadFields payloadFields = parsePayload(caseId, kybCase.getExtractionData());
            fields = payloadFields.fields();
            redFlags = payloadFields.redFlags();
        }

        return new CaseDetailResponse(
                kybCase.getId(),
                kybCase.getStatus().name(),
                kybCase.getCreatedAt(),
                kybCase.getUpdatedAt(),
                kybCase.getLockedAt(),
                audit,
                kybCase.getEntityName(),
                fields,
                redFlags);
    }

    private PayloadFields parsePayload(UUID caseId, String payloadJson) {
        try {
            Map<String, Object> payloadMap = objectMapper.readValue(payloadJson, new TypeReference<Map<String, Object>>() {
            });
            List<FieldRecord> fields = objectMapper.convertValue(
                    payloadMap.get("fields"), new TypeReference<List<FieldRecord>>() {
                    });
            List<RedFlagItem> redFlags = payloadMap.containsKey("red_flags")
                    ? objectMapper.convertValue(payloadMap.get("red_flags"), new TypeReference<List<RedFlagItem>>() {
                    })
                    : null;
            return new PayloadFields(fields, redFlags);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            log.warn("Failed to parse audit payload for case {}: {}", caseId, e.getMessage());
            return new PayloadFields(null, null);
        }
    }

    private record PayloadFields(List<FieldRecord> fields, List<RedFlagItem> redFlags) {
    }
}
