package com.example.clearkyc.web.dto;

import java.time.Instant;
import java.util.UUID;

public record CaseDetailResponse(
        UUID id,
        String status,
        Instant createdAt,
        Instant updatedAt,
        Instant lockedAt,
        AuditSummary audit,
        String entityName) {
}
