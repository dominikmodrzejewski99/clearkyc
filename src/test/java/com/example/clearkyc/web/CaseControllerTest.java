package com.example.clearkyc.web;

import com.example.clearkyc.config.SecurityConfig;
import com.example.clearkyc.service.CaseService;
import com.example.clearkyc.web.dto.CaseDetailResponse;
import com.example.clearkyc.web.dto.CreateCaseResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.web.server.ResponseStatusException;

@WebMvcTest(CaseController.class)
@Import(SecurityConfig.class)
class CaseControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private CaseService caseService;

    private static final MockMultipartFile PDF_FILE =
            new MockMultipartFile("file", "test.pdf", "application/pdf", "pdf-content".getBytes());

    @Test
    void createCase_withoutJwt_returns401() throws Exception {
        mockMvc.perform(multipart("/api/cases").file(PDF_FILE))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void createCase_withJwt_returns201WithId() throws Exception {
        UUID id = UUID.randomUUID();
        when(caseService.createCase())
                .thenReturn(new CreateCaseResponse(id, "CREATED", Instant.now()));

        mockMvc.perform(multipart("/api/cases")
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.status").value("CREATED"));
    }

    @Test
    void getCase_withJwt_existingCase_returns200() throws Exception {
        UUID id = UUID.randomUUID();
        when(caseService.getCase(id))
                .thenReturn(new CaseDetailResponse(id, "CREATED", Instant.now(), Instant.now(), null, null));

        mockMvc.perform(get("/api/cases/{id}", id).with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()));
    }

    @Test
    void getCase_withJwt_unknownCase_returns404() throws Exception {
        when(caseService.getCase(any())).thenThrow(new ResponseStatusException(NOT_FOUND));

        mockMvc.perform(get("/api/cases/{id}", UUID.randomUUID()).with(jwt()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getCase_withoutJwt_returns401() throws Exception {
        mockMvc.perform(get("/api/cases/{id}", UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }
}
