package com.example.clearkyc.repository;

import com.example.clearkyc.domain.AuditRecord;
import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.DecisionType;
import com.example.clearkyc.domain.KybCase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@TestPropertySource(properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop"})
class AuditRecordRepositoryTest {

    @Autowired
    private KybCaseRepository kybCaseRepository;

    @Autowired
    private AuditRecordRepository auditRecordRepository;

    @Test
    void save_persistsAuditRecord_withJsonPayload() {
        KybCase kybCase = kybCaseRepository.save(new KybCase(CaseStatus.ANALYZED));
        String payload = "{\"decision\":\"APPROVE\"}";
        AuditRecord record = new AuditRecord(kybCase, "analyst@example.com", DecisionType.APPROVE, payload);

        AuditRecord saved = auditRecordRepository.save(record);
        Optional<AuditRecord> found = auditRecordRepository.findById(saved.getId());

        assertTrue(found.isPresent());
        assertEquals(payload, found.get().getPayload());
    }

    @Test
    void findByKybCase_returnsRecord_whenExists() {
        KybCase kybCase = kybCaseRepository.save(new KybCase(CaseStatus.ANALYZED));
        auditRecordRepository.save(
                new AuditRecord(kybCase, "analyst@example.com", DecisionType.APPROVE, "{}")
        );

        Optional<AuditRecord> found = auditRecordRepository.findByKybCase(kybCase);

        assertTrue(found.isPresent());
    }
}
