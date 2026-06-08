package com.example.clearkyc.web;

import com.example.clearkyc.service.CaseService;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import com.example.clearkyc.web.dto.CaseSummaryResponse;
import com.example.clearkyc.web.dto.CreateCaseResponse;
import com.example.clearkyc.web.dto.UpdateCaseRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/cases")
public class CaseController {

    private final CaseService caseService;

    public CaseController(CaseService caseService) {
        this.caseService = caseService;
    }

    @GetMapping
    public List<CaseSummaryResponse> listCases() {
        return caseService.listCases();
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
        return caseService.createCase(entityName);
    }

    @GetMapping("/{caseId}")
    public CaseDetailResponse getCase(@PathVariable UUID caseId) {
        return caseService.getCase(caseId);
    }

    @PatchMapping(value = "/{caseId}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public CaseDetailResponse updateCase(
            @PathVariable UUID caseId,
            @RequestBody UpdateCaseRequest request) {
        return caseService.updateCase(caseId, request);
    }

    @DeleteMapping("/{caseId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteCase(@PathVariable UUID caseId) {
        caseService.deleteCase(caseId);
    }
}
