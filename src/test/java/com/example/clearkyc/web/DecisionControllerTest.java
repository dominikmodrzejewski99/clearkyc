package com.example.clearkyc.web;

import com.example.clearkyc.config.SecurityConfig;
import com.example.clearkyc.service.FinalizeService;
import com.example.clearkyc.web.dto.FinalizeResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(DecisionController.class)
@Import(SecurityConfig.class)
class DecisionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private FinalizeService finalizeService;

    private static final String VALID_JSON =
            """
            {"decision":"APPROVE","fields":[{"fieldName":"companyName","value":"Acme Corp","citations":[]}]}
            """;

    @Test
    void finalizeCase_withoutJwt_returns401() throws Exception {
        mockMvc.perform(post("/api/cases/{id}/finalize", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void finalizeCase_withJwt_validPayload_returns200() throws Exception {
        UUID caseId = UUID.randomUUID();
        UUID auditId = UUID.randomUUID();
        when(finalizeService.finalize(any(), any(), any()))
                .thenReturn(new FinalizeResponse(auditId, "APPROVE", Instant.now()));

        mockMvc.perform(post("/api/cases/{id}/finalize", caseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON)
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.auditRecordId").value(auditId.toString()))
                .andExpect(jsonPath("$.decision").value("APPROVE"));
    }

    @Test
    void finalizeCase_withJwt_lockedCase_returns409() throws Exception {
        when(finalizeService.finalize(any(), any(), any()))
                .thenThrow(new ResponseStatusException(CONFLICT, "Case is already locked"));

        mockMvc.perform(post("/api/cases/{id}/finalize", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON)
                        .with(jwt()))
                .andExpect(status().isConflict());
    }

    @Test
    void finalizeCase_withJwt_caseOwnedByAnotherAnalyst_returns404() throws Exception {
        // Service returns 404 when the case exists but belongs to a different analyst (IDOR guard).
        when(finalizeService.finalize(any(), any(), eq("analyst-a")))
                .thenThrow(new ResponseStatusException(NOT_FOUND, "Case not found"));

        mockMvc.perform(post("/api/cases/{id}/finalize", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON)
                        .with(jwt().jwt(j -> j.subject("analyst-a"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void finalizeCase_withJwt_fieldWithNullOverride_returns200() throws Exception {
        UUID caseId = UUID.randomUUID();
        UUID auditId = UUID.randomUUID();
        when(finalizeService.finalize(any(), any(), any()))
                .thenReturn(new FinalizeResponse(auditId, "APPROVE", Instant.now()));

        mockMvc.perform(post("/api/cases/{id}/finalize", caseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"decision":"APPROVE","fields":[{"fieldName":"companyName","value":"Acme Corp","citations":[],"override":null}]}
                                """)
                        .with(jwt()))
                .andExpect(status().isOk());
    }

    @Test
    void finalizeCase_withJwt_fieldWithPopulatedOverride_returns200() throws Exception {
        UUID caseId = UUID.randomUUID();
        UUID auditId = UUID.randomUUID();
        when(finalizeService.finalize(any(), any(), any()))
                .thenReturn(new FinalizeResponse(auditId, "APPROVE", Instant.now()));

        mockMvc.perform(post("/api/cases/{id}/finalize", caseId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"decision":"APPROVE","fields":[{"fieldName":"companyName","value":"Corrected Corp","citations":[],"override":{"originalValue":"Acme Corp","newValue":"Corrected Corp","justification":"Registry shows updated name"}}]}
                                """)
                        .with(jwt()))
                .andExpect(status().isOk());
    }

    @Test
    void finalizeCase_withJwt_invalidSchemaPayload_returns422() throws Exception {
        when(finalizeService.finalize(any(), any(), any()))
                .thenThrow(new ResponseStatusException(UNPROCESSABLE_ENTITY, "Schema validation failed"));

        mockMvc.perform(post("/api/cases/{id}/finalize", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON)
                        .with(jwt()))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void finalizeCase_withJwtMissingSubClaim_returns500() throws Exception {
        mockMvc.perform(post("/api/cases/{id}/finalize", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_JSON)
                        .with(jwt().jwt(j -> j.claims(c -> c.remove("sub")))))
                .andExpect(status().is(INTERNAL_SERVER_ERROR.value()));
    }
}
