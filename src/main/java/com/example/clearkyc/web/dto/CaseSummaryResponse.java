package com.example.clearkyc.web.dto;

import java.time.Instant;
import java.util.UUID;

public record CaseSummaryResponse(
        UUID id,
        String status,
        Instant createdAt,
        String entityName,
        String decision) {
}
