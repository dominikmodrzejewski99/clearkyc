package com.example.clearkyc.analysis;

import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import reactor.core.publisher.Flux;

import com.example.clearkyc.web.AnalystIdentityResolver;

import java.util.UUID;

@RestController
public class ExtractionController {

    private final ExtractionService extractionService;

    public ExtractionController(ExtractionService extractionService) {
        this.extractionService = extractionService;
    }

    @PostMapping(
            value = "/api/cases/{caseId}/analysis",
            produces = MediaType.TEXT_EVENT_STREAM_VALUE + ";charset=UTF-8",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public Flux<ServerSentEvent<ExtractionEvent>> streamAnalysis(
            @PathVariable UUID caseId,
            @RequestPart("file") MultipartFile pdfFile,
            @AuthenticationPrincipal Jwt jwt) {
        return extractionService.streamAnalysis(caseId, pdfFile, AnalystIdentityResolver.resolve(jwt));
    }
}
