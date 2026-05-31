package com.example.clearkyc.repository;

import com.example.clearkyc.domain.AuditRecord;
import com.example.clearkyc.domain.KybCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AuditRecordRepository extends JpaRepository<AuditRecord, UUID> {
    Optional<AuditRecord> findByKybCase(KybCase kybCase);
}
