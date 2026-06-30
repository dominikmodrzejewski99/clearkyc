package com.example.clearkyc.web;

import com.example.clearkyc.service.CaseService;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import com.example.clearkyc.web.dto.CaseSummaryResponse;
import com.example.clearkyc.web.dto.CreateCaseResponse;
import com.example.clearkyc.web.dto.UpdateCaseRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/cases")
public class CaseController {

    private final CaseService caseService;

    public CaseController(CaseService caseService) {
        this.caseService = caseService;
    }

    private static String analystIdentity(Jwt jwt) {
        return jwt != null ? jwt.getSubject() : "dev-user";
    }

    @GetMapping
    public List<CaseSummaryResponse> listCases(@AuthenticationPrincipal Jwt jwt) {
        return caseService.listCases(analystIdentity(jwt));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public CreateCaseResponse createCase(
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) {
        if (!"application/pdf".equals(file.getContentType())) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Only PDF files are accepted");
        }
        String originalName = file.getOriginalFilename();
        String entityName = originalName != null
                ? originalName.replaceAll("(?i)\\.pdf$", "")
                : null;
        try {
            return caseService.createCase(entityName, file.getBytes(), analystIdentity(jwt));
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Failed to read PDF");
        }
    }

    @GetMapping(value = "/{caseId}/document", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<byte[]> getDocument(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal Jwt jwt) {
        byte[] pdf = caseService.getPdfData(caseId, analystIdentity(jwt));
        if (pdf == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdf);
    }

    @GetMapping("/{caseId}")
    public CaseDetailResponse getCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal Jwt jwt) {
        return caseService.getCase(caseId, analystIdentity(jwt));
    }

    @PatchMapping(value = "/{caseId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public CaseDetailResponse updateCase(
            @PathVariable UUID caseId,
            @RequestBody UpdateCaseRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        return caseService.updateCase(caseId, request, analystIdentity(jwt));
    }

    @DeleteMapping("/{caseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCase(
            @PathVariable UUID caseId,
            @AuthenticationPrincipal Jwt jwt) {
        caseService.deleteCase(caseId, analystIdentity(jwt));
    }
}
