package com.example.clearkyc.analysis;

import java.util.List;

public sealed interface ExtractionEvent permits
        ExtractionEvent.FieldExtracted,
        ExtractionEvent.AnalysisComplete,
        ExtractionEvent.AnalysisError,
        ExtractionEvent.RedFlagsFound {

    public record FieldExtracted(String fieldName, String value, List<Citation> citations)
            implements ExtractionEvent {
    }

    public record AnalysisComplete(String caseId) implements ExtractionEvent {
    }

    public record AnalysisError(String errorCode, String message) implements ExtractionEvent {
    }

    public record RedFlagsFound(List<RedFlagItem> flags) implements ExtractionEvent {
    }
}
