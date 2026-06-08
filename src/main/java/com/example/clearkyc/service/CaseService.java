package com.example.clearkyc.service;

import com.example.clearkyc.domain.CaseStatus;
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
    public CaseDetailResponse updateCase(UUID caseId, UpdateCaseRequest request) {
        KybCase kybCase = kybCaseRepository.findById(caseId)
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
    public void deleteCase(UUID caseId) {
        KybCase kybCase = kybCaseRepository.findById(caseId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Case not found"));
        if (kybCase.getStatus() != CaseStatus.CREATED) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Only cases in CREATED state can be deleted");
        }
        kybCaseRepository.delete(kybCase);
    }

    @Transactional(readOnly = true)
    public List<CaseSummaryResponse> listCases() {
        return kybCaseRepository.findAll().stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .map(c -> new CaseSummaryResponse(
                        c.getId(),
                        c.getStatus().name(),
                        c.getCreatedAt(),
                        c.getEntityName(),
                        null))
                .toList();
    }

    public CreateCaseResponse createCase(String entityName) {
        KybCase kybCase = kybCaseRepository.save(new KybCase(CaseStatus.CREATED, entityName));
        return new CreateCaseResponse(kybCase.getId(), kybCase.getStatus().name(), kybCase.getCreatedAt());
    }

    @Transactional(readOnly = true)
    public CaseDetailResponse getCase(UUID caseId) {
        KybCase kybCase = kybCaseRepository.findById(caseId)
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
