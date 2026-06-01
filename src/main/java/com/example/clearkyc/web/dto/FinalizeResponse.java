package com.example.clearkyc.web.dto;

import java.time.Instant;
import java.util.UUID;

public record FinalizeResponse(UUID auditRecordId, String decision, Instant finalizedAt) {
}
