package com.example.clearkyc.web.dto;

import java.util.List;

public record FieldRecord(
        String fieldName,
        String value,
        List<CitationRecord> citations,
        FieldOverride override) {
}
