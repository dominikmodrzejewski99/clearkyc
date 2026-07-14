package com.example.clearkyc.web;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpStatus.INTERNAL_SERVER_ERROR;

class AnalystIdentityResolverTest {

    @Test
    void resolveReturnsDevUserWhenJwtIsNull() {
        assertThat(AnalystIdentityResolver.resolve(null)).isEqualTo("dev-user");
    }

    @Test
    void resolveReturnsSubjectWhenPresent() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "none")
                .subject("analyst-a")
                .claim("sub", "analyst-a")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();

        assertThat(AnalystIdentityResolver.resolve(jwt)).isEqualTo("analyst-a");
    }

    @Test
    void resolveThrows500WhenJwtPresentButSubClaimMissing() {
        Jwt jwt = new Jwt("token", Instant.now(), Instant.now().plusSeconds(60),
                Map.of("alg", "none"), Map.of("other", "claim"));

        assertThatThrownBy(() -> AnalystIdentityResolver.resolve(jwt))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(e -> assertThat(((ResponseStatusException) e).getStatusCode())
                        .isEqualTo(INTERNAL_SERVER_ERROR));
    }
}
