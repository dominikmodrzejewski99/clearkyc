package com.example.clearkyc.web.dto;

import java.time.Instant;
import java.util.UUID;

public record AuditSummary(UUID auditRecordId, String decision, Instant finalizedAt) {
}
