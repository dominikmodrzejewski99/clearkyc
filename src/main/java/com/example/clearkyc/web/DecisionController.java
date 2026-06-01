package com.example.clearkyc.web;

import com.example.clearkyc.service.FinalizeService;
import com.example.clearkyc.web.dto.FinalizeRequest;
import com.example.clearkyc.web.dto.FinalizeResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

@RestController
@RequestMapping("/api/cases")
public class DecisionController {

    private final FinalizeService finalizeService;

    public DecisionController(FinalizeService finalizeService) {
        this.finalizeService = finalizeService;
    }

    @PostMapping("/{caseId}/finalize")
    public FinalizeResponse finalizeCase(
            @PathVariable UUID caseId,
            @RequestBody FinalizeRequest request,
            @AuthenticationPrincipal Jwt jwt) {
        if (jwt.getSubject() == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "JWT missing sub claim");
        }
        return finalizeService.finalize(caseId, request, jwt.getSubject());
    }
}
