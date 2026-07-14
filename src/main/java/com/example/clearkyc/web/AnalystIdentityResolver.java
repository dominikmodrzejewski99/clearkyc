package com.example.clearkyc.web;

import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

/**
 * Single point of truth for resolving the analyst identity used as the ownership key
 * across cases. A present JWT may legally omit the "sub" claim — that must surface as
 * a clean 500, not a raw persistence failure from a null value hitting a non-nullable column.
 */
public final class AnalystIdentityResolver {

    private AnalystIdentityResolver() {
    }

    public static String resolve(Jwt jwt) {
        if (jwt == null) {
            return "dev-user";
        }
        String subject = jwt.getSubject();
        if (subject == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "JWT missing sub claim");
        }
        return subject;
    }
}
