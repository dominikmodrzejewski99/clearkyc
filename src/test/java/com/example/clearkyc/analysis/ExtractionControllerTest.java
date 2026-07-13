package com.example.clearkyc.analysis;

import com.example.clearkyc.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.lessThan;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;
import static org.springframework.http.HttpStatus.NOT_FOUND;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ExtractionController.class)
@Import(SecurityConfig.class)
class ExtractionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private ExtractionService extractionService;

    private static final MockMultipartFile PDF_FILE =
            new MockMultipartFile("file", "test.pdf", "application/pdf", "pdf-content".getBytes());

    @Test
    void triggerAnalysis_withoutJwt_returns401() throws Exception {
        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void triggerAnalysis_withJwt_validCase_returnsOkWithEventStream() throws Exception {
        UUID caseId = UUID.randomUUID();
        when(extractionService.streamAnalysis(eq(caseId), any(), any()))
                .thenReturn(Flux.just(
                        ServerSentEvent.<ExtractionEvent>builder()
                                .event("AnalysisComplete")
                                .data(new ExtractionEvent.AnalysisComplete(caseId.toString()))
                                .build()
                ));

        mockMvc.perform(multipart("/api/cases/{id}/analysis", caseId)
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, containsString(MediaType.TEXT_EVENT_STREAM_VALUE)));
    }

    @Test
    void triggerAnalysis_withJwt_caseNotFound_returns404() throws Exception {
        when(extractionService.streamAnalysis(any(), any(), any()))
                .thenThrow(new ResponseStatusException(NOT_FOUND));

        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(status().isNotFound());
    }

    @Test
    void triggerAnalysis_withJwt_caseOwnedByAnotherAnalyst_returns404() throws Exception {
        // Service returns 404 when the case exists but belongs to a different analyst (IDOR guard).
        when(extractionService.streamAnalysis(any(), any(), eq("analyst-a")))
                .thenThrow(new ResponseStatusException(NOT_FOUND, "Case not found"));

        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE)
                        .with(jwt().jwt(j -> j.subject("analyst-a"))))
                .andExpect(status().isNotFound());
    }

    @Test
    void triggerAnalysis_withJwt_caseAlreadyAnalyzing_returns409() throws Exception {
        when(extractionService.streamAnalysis(any(), any(), any()))
                .thenThrow(new ResponseStatusException(CONFLICT));

        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(status().isConflict());
    }

    @Test
    void triggerAnalysis_withJwt_caseIsLocked_returns409() throws Exception {
        when(extractionService.streamAnalysis(any(), any(), any()))
                .thenThrow(new ResponseStatusException(CONFLICT));

        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(status().isConflict());
    }

    @Test
    void analysisEmitsRedFlagsFound() throws Exception {
        UUID caseId = UUID.randomUUID();
        when(extractionService.streamAnalysis(eq(caseId), any(), any()))
                .thenReturn(Flux.just(
                        ServerSentEvent.<ExtractionEvent>builder()
                                .event("FieldExtracted")
                                .data(new ExtractionEvent.FieldExtracted("companyName", "Acme Corp", List.of()))
                                .build(),
                        ServerSentEvent.<ExtractionEvent>builder()
                                .event("RedFlagsFound")
                                .data(new ExtractionEvent.RedFlagsFound(List.of(
                                        new RedFlagItem(RedFlagCategory.OPAQUE_OWNERSHIP, "test", List.of()))))
                                .build(),
                        ServerSentEvent.<ExtractionEvent>builder()
                                .event("AnalysisComplete")
                                .data(new ExtractionEvent.AnalysisComplete(caseId.toString()))
                                .build()
                ));

        var asyncResult = mockMvc.perform(multipart("/api/cases/{id}/analysis", caseId)
                        .file(PDF_FILE)
                        .with(jwt()))
                .andExpect(request().asyncStarted())
                .andReturn();

        String body = mockMvc.perform(asyncDispatch(asyncResult))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        int fieldIdx = body.indexOf("FieldExtracted");
        int flagsIdx = body.indexOf("RedFlagsFound");
        int completeIdx = body.indexOf("AnalysisComplete");
        assertThat(fieldIdx, lessThan(flagsIdx));
        assertThat(flagsIdx, lessThan(completeIdx));
    }

    @Test
    void triggerAnalysis_withJwtMissingSubClaim_returns500() throws Exception {
        mockMvc.perform(multipart("/api/cases/{id}/analysis", UUID.randomUUID())
                        .file(PDF_FILE)
                        .with(jwt().jwt(j -> j.claims(c -> c.remove("sub")))))
                .andExpect(status().is(INTERNAL_SERVER_ERROR.value()));
    }
}
