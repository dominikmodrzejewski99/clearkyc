package com.example.clearkyc.analysis;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ExtractionServiceTest {

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @Test
    void classifyLineRecognizesFieldLineWhoseValueContainsLiteralCategorySubstring() {
        // Regression for the substring-search heuristic that misrouted this exact shape to
        // RedFlagItem parsing and silently dropped the field (logged as "unparseable NDJSON line").
        String line = "{\"fieldName\":\"companyName\",\"value\":\"See \\\"category\\\": Retail on p.3\",\"citations\":[]}";

        ExtractionService.LineKind kind = ExtractionService.classifyLine(line, jsonMapper);

        assertThat(kind).isEqualTo(ExtractionService.LineKind.FIELD);
    }

    @Test
    void classifyLineRecognizesRedFlagLine() {
        String line = "{\"category\":\"SANCTIONS_EXPOSURE\",\"description\":\"desc\",\"citations\":[]}";

        ExtractionService.LineKind kind = ExtractionService.classifyLine(line, jsonMapper);

        assertThat(kind).isEqualTo(ExtractionService.LineKind.RED_FLAG);
    }

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
