package com.example.clearkyc.service;

import com.example.clearkyc.domain.AuditRecord;
import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.DecisionType;
import com.example.clearkyc.domain.KybCase;
import com.example.clearkyc.repository.AuditRecordRepository;
import com.example.clearkyc.repository.KybCaseRepository;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CaseServiceTest {

    @Mock
    private KybCaseRepository kybCaseRepository;

    @Mock
    private AuditRecordRepository auditRecordRepository;

    private CaseService caseService;

    private static final String ANALYST = "analyst-a";

    private KybCase lockedCase() {
        KybCase kybCase = new KybCase(CaseStatus.LOCKED, "AcmeCorp", ANALYST);
        kybCase.setStatus(CaseStatus.LOCKED);
        return kybCase;
    }

    @Test
    void getCase_lockedWithValidPayload_returnsFieldsAndRedFlags() {
        caseService = new CaseService(kybCaseRepository, auditRecordRepository);
        UUID caseId = UUID.randomUUID();
        KybCase kybCase = lockedCase();
        String payload = """
                {
                  "caseId": "%s",
                  "analystIdentity": "%s",
                  "decision": "APPROVE",
                  "finalizedAt": "2026-07-06T10:00:00Z",
                  "fields": [
                    {
                      "fieldName": "companyName",
                      "value": "Acme Corp",
                      "citations": [{"page": 1, "quote": "Acme Corp Ltd."}],
                      "override": null
                    },
                    {
                      "fieldName": "director1",
                      "value": "Jane Doe",
                      "citations": [{"page": 2, "quote": "Director: Jane Doe"}],
                      "override": {"originalValue": "Jane Doe", "newValue": "Jane A. Doe", "justification": "Corrected spelling"}
                    }
                  ],
                  "red_flags": [
                    {"category": "SHELL_COMPANY_INDICATORS", "description": "No physical office found", "citations": []}
                  ]
                }
                """.formatted(caseId, ANALYST);
        AuditRecord auditRecord = new AuditRecord(kybCase, ANALYST, DecisionType.APPROVE, payload);

        when(kybCaseRepository.findByIdAndAnalystIdentity(caseId, ANALYST)).thenReturn(Optional.of(kybCase));
        when(auditRecordRepository.findByKybCase(kybCase)).thenReturn(Optional.of(auditRecord));

        CaseDetailResponse response = caseService.getCase(caseId, ANALYST);

        assertThat(response.fields()).hasSize(2);
        assertThat(response.fields().get(0).fieldName()).isEqualTo("companyName");
        assertThat(response.fields().get(1).override()).isNotNull();
        assertThat(response.fields().get(1).override().newValue()).isEqualTo("Jane A. Doe");
        assertThat(response.red_flags()).hasSize(1);
        assertThat(response.red_flags().get(0).description()).isEqualTo("No physical office found");
        assertThat(response.audit()).isNotNull();
    }

    @Test
    void getCase_lockedWithMalformedPayload_returnsNullFieldsWithoutThrowing() {
        caseService = new CaseService(kybCaseRepository, auditRecordRepository);
        UUID caseId = UUID.randomUUID();
        KybCase kybCase = lockedCase();
        AuditRecord auditRecord = new AuditRecord(kybCase, ANALYST, DecisionType.APPROVE, "{not valid json");

        when(kybCaseRepository.findByIdAndAnalystIdentity(caseId, ANALYST)).thenReturn(Optional.of(kybCase));
        when(auditRecordRepository.findByKybCase(kybCase)).thenReturn(Optional.of(auditRecord));

        CaseDetailResponse response = caseService.getCase(caseId, ANALYST);

        assertThat(response.fields()).isNull();
        assertThat(response.red_flags()).isNull();
        assertThat(response.audit()).isNotNull();
        assertThat(response.status()).isEqualTo("LOCKED");
    }

    @Test
    void getCase_nonLockedStatus_returnsNullFields() {
        caseService = new CaseService(kybCaseRepository, auditRecordRepository);
        UUID caseId = UUID.randomUUID();
        KybCase kybCase = new KybCase(CaseStatus.ANALYZED, "AcmeCorp", ANALYST);

        when(kybCaseRepository.findByIdAndAnalystIdentity(caseId, ANALYST)).thenReturn(Optional.of(kybCase));

        CaseDetailResponse response = caseService.getCase(caseId, ANALYST);

        assertThat(response.fields()).isNull();
        assertThat(response.red_flags()).isNull();
        assertThat(response.audit()).isNull();
    }
}
