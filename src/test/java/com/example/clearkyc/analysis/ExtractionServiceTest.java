package com.example.clearkyc.analysis;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExtractionServiceTest {

    @Test
    void wireTypePinsFieldExtractedName() {
        var event = new ExtractionEvent.FieldExtracted("companyName", "Acme Corp", List.of());
        assertThat(ExtractionService.wireType(event)).isEqualTo("FieldExtracted");
    }

    @Test
    void wireTypePinsAnalysisCompleteName() {
        var event = new ExtractionEvent.AnalysisComplete("case-123");
        assertThat(ExtractionService.wireType(event)).isEqualTo("AnalysisComplete");
    }

    @Test
    void wireTypePinsAnalysisErrorName() {
        var event = new ExtractionEvent.AnalysisError("EXTRACTION_ERROR", "boom");
        assertThat(ExtractionService.wireType(event)).isEqualTo("AnalysisError");
    }

    @Test
    void wireTypePinsRedFlagsFoundName() {
        var event = new ExtractionEvent.RedFlagsFound(List.of());
        assertThat(ExtractionService.wireType(event)).isEqualTo("RedFlagsFound");
    }
}
