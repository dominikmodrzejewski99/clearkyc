package com.example.clearkyc.web.dto;

import java.time.Instant;
import java.util.UUID;

public record CreateCaseResponse(UUID id, String status, Instant createdAt) {
}
