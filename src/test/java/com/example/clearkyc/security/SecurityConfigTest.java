package com.example.clearkyc.security;

import com.example.clearkyc.analysis.ExtractionService;
import com.example.clearkyc.config.SecurityConfig;
import com.example.clearkyc.service.CaseService;
import com.example.clearkyc.service.FinalizeService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest
@Import(SecurityConfig.class)
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private ExtractionService extractionService;

    @MockitoBean
    private CaseService caseService;

    @MockitoBean
    private FinalizeService finalizeService;

    @Test
    void actuatorHealth_isPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().is2xxSuccessful());
    }

    @Test
    void apiEndpoint_withoutToken_returns401() throws Exception {
        mockMvc.perform(get("/api/nonexistent"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void apiEndpoint_withJwtToken_isNotUnauthorized() throws Exception {
        // jwt() creates JwtAuthenticationToken; Spring Security passes through
        mockMvc.perform(get("/api/nonexistent").with(jwt()))
                .andExpect(result -> assertNotEquals(401, result.getResponse().getStatus()));
    }
}
