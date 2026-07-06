package com.example.clearkyc.web.dto;

import com.example.clearkyc.analysis.RedFlagItem;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CaseDetailResponse(
        UUID id,
        String status,
        Instant createdAt,
        Instant updatedAt,
        Instant lockedAt,
        AuditSummary audit,
        String entityName,
        List<FieldRecord> fields,
        List<RedFlagItem> red_flags) {
}
