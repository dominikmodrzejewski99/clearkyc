package com.example.clearkyc.service;

import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.DecisionType;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.AuditRecordRepository;
import com.example.clearkyc.repository.KybCaseRepository;
import com.example.clearkyc.web.dto.AuditSummary;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import com.example.clearkyc.web.dto.CaseSummaryResponse;
import com.example.clearkyc.web.dto.CreateCaseResponse;
import com.example.clearkyc.web.dto.UpdateCaseRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
public class CaseService {

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
                kybCase.getEntityName());
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
        if (kybCase.getStatus() == CaseStatus.LOCKED) {
            audit = auditRecordRepository.findByKybCase(kybCase)
                    .map(r -> new AuditSummary(r.getId(), r.getDecision().name(), r.getFinalizedAt()))
                    .orElse(null);
        }

        return new CaseDetailResponse(
                kybCase.getId(),
                kybCase.getStatus().name(),
                kybCase.getCreatedAt(),
                kybCase.getUpdatedAt(),
                kybCase.getLockedAt(),
                audit,
                kybCase.getEntityName());
    }
}
