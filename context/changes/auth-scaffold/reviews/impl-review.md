<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth Scaffold (F-01)

- **Plan**: context/changes/auth-scaffold/plan.md
- **Scope**: All Phases (1-3)
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION (3 warnings triaged and fixed)
- **Findings**: 0 critical | 3 warnings | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated Verification

- `./mvnw test` → PASS (4 tests, 0 failures)
- `ng build --configuration=development` → PASS (clean, 2.27s)

## Findings

### F1 — authHttpInterceptorFn nie podpięty pod HttpClient

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: web/src/app/app.config.ts:15
- **Detail**: provideHttpClient() bez withInterceptors([authHttpInterceptorFn]). Angular HTTP calls do /api/** nie dołączają nagłówka Authorization — każdy request dostanie 401. Demo działało bo scaffold nie ma jeszcze wywołań API, ale S-01/S-02/S-03 trafi na to od razu.
- **Fix Applied**: provideHttpClient(withInterceptors([authHttpInterceptorFn])) + httpInterceptor.allowedList z uriMatcher dla /api/
- **Decision**: FIXED via Fix A

### F2 — application-dev.properties scommittowane z rzeczywistymi wartościami

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/main/resources/application-dev.properties
- **Detail**: Plan jawnie mówił "Plik NIGDY nie trafia do repozytorium z prawdziwymi wartościami". Plik był w repo z issuer-uri Auth0 dev-tenant. Dodatkowy problem: linia ALLOWED_ORIGINS= w pliku nie robiła nic (czytana przez System.getenv(), nie Spring properties).
- **Fix Applied**: Dodano do .gitignore, plik untrackowany (git rm --cached), stworzono application-dev.properties.example z placeholderami, usunięto nieaktywną linię ALLOWED_ORIGINS.
- **Decision**: FIXED via Fix A

### F3 — Brak audience w provideAuth0

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: web/src/app/app.config.ts:18-24
- **Detail**: Bez audience Auth0 wydaje token dla User Info endpoint, nie custom API. Demo działało bo Resource Server z samym issuer-uri nie wymusza audience claim, ale to ryzyko dla prod.
- **Fix Applied**: audience: 'http://localhost:1999' dodany do authorizationParams (identyfikator wybrany przez użytkownika — wymaga skonfigurowania API w Auth0 dashboard).
- **Decision**: FIXED

### F4 — Test 3 assertion drift: isOk() vs. plan "not 401 (expect 404)"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/test/java/com/example/clearkyc/security/SecurityConfigTest.java:41-44
- **Detail**: Plan mówił "not 401 (404 expected)", test assertował isOk() (200, bo SPA catch-all). Nazwa testu isNotUnauthorized nie zgadzała się z asercją isOk().
- **Fix Applied**: Zmieniono asercję na result -> assertNotEquals(401, result.getResponse().getStatus()) — dopasowuje intencję (nie 401) do implementacji.
- **Decision**: FIXED

### F5 — CORS parsing bez String.trim()

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/main/java/com/example/clearkyc/config/SecurityConfig.java
- **Detail**: split(",") bez trim() — spacje wokół przecinków generują niepoprawne originy.
- **Fix Applied**: Arrays.stream().map(String::trim).collect(Collectors.toList())
- **Decision**: FIXED

### F6 — packageManager wskazuje npm 9.2.0, Node 24 ma npm 10.x

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: web/package.json:12
- **Detail**: Deklaratywna wskazówka dla Corepack, który nie jest używany. Pole wprowadzało w błąd co do wersji npm w Maven CI (Node 24).
- **Fix Applied**: Usunięto pole packageManager — bez Corepack to tylko szum.
- **Decision**: FIXED
