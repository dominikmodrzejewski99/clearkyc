package com.example.clearkyc.repository;

import com.example.clearkyc.domain.CaseStatus;
import com.example.clearkyc.domain.KybCase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@TestPropertySource(properties = {"spring.flyway.enabled=false", "spring.jpa.hibernate.ddl-auto=create-drop"})
class KybCaseRepositoryTest {

    @Autowired
    private KybCaseRepository repository;

    @Test
    void save_generatesUUID_whenIdNull() {
        KybCase saved = repository.save(new KybCase(CaseStatus.CREATED, null, "test-analyst"));

        assertNotNull(saved.getId());
    }

    @Test
    void findById_returnsCase_whenExists() {
        KybCase saved = repository.save(new KybCase(CaseStatus.CREATED, null, "test-analyst"));

        Optional<KybCase> found = repository.findById(saved.getId());

        assertTrue(found.isPresent());
    }

    @Test
    void save_setsCreatedAt_automatically() {
        KybCase saved = repository.saveAndFlush(new KybCase(CaseStatus.CREATED, null, "test-analyst"));

        assertNotNull(saved.getCreatedAt());
    }
}
