<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth Scaffold (F-01)

- **Plan**: `context/changes/auth-scaffold/plan.md`
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE
- **Findings**: 1 critical (fixed), 4 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| End-State Alignment | WARNING |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

6/7 paths ✓ (environment.ts absent - plan to antycypuje), symbols ✓ (SpaController, authGuard potwierdzone), brief↔plan ✓

## Findings

### F1 — Plan wewnętrznie sprzeczny w kwestii silent refresh

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — realny trade-off; wymaga poprawki w kilku miejscach
- **Dimension**: End-State Alignment / Blind Spots
- **Location**: Critical Implementation Details + Phase 2 punkt 7 + success criterion 2.7
- **Detail**: angular-oauth2-oidc z PKCE Code Flow automatycznie używa `refreshToken()` przez POST do token endpoint - nie iframe. `silent-refresh.html` to mechanizm dla Implicit Flow. Auth0 oficjalnie wycofał iframe silent auth dla SPA z powodu SameSite/third-party cookie restrictions (Safari ITP, Firefox Total Cookie Protection, Chrome CHIPS). Plan w Critical Implementation Details poprawnie wspominał `useSilentRefresh = false`, ale Phase 2 punkt 7 nakazywał stworzyć `silent-refresh.html` - implementer mógł wybrać błędną gałąź.
- **Fix applied**: Fix A - Usunięto punkt 7 (silent-refresh.html) z Phase 2. Zaktualizowano Critical Implementation Details, scope do `offline_access`, AuthService contract, success criterion 2.7, manual verification 1.3 (Auth0 Refresh Token Rotation + Allow Offline Access), plan-brief.md.
- **Decision**: FIXED (Fix A)

### F2 — provideZonelessChangeDetection() + angular-oauth2-oidc NgZone conflict

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny trade-off; sprawdzić zanim ruszysz dalej
- **Dimension**: Blind Spots
- **Location**: Phase 2 — AuthService / app.config.ts
- **Detail**: Projekt używa `provideZonelessChangeDetection()` (app.config.ts:4). angular-oauth2-oidc wywołuje `NgZone.run()` do triggerowania change detection po zdarzeniach tokenów. Z zoneless CD te wywołania mogą nie wyzwolić Signals/CD update. Plan nie wspomina o tym ryzyku.
- **Fix**: Dodaj do Critical Implementation Details: "Projekt używa zoneless CD — po integracji angular-oauth2-oidc zweryfikuj manualnie, że zmiana stanu auth (login/logout) aktualizuje UI. Jeśli nie: subskrybuj OAuthService.events i wywołaj ChangeDetectorRef.markForCheck() ręcznie."
- **Decision**: PENDING

### F3 — app.spec.ts blast-radius nieuwzględniony

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — oczywista poprawka, wąski zakres
- **Dimension**: Blind Spots
- **Location**: Phase 3 — success criteria
- **Detail**: `web/src/app/app.spec.ts` istnieje z już zepsutą asercją (szuka `<h1>Hello, web</h1>` ale template to `<router-outlet />`). Dodanie OAuthService bez aktualizacji TestBed spowoduje drugi fail. Plik nie wymieniony w planie.
- **Fix**: Dodaj do Phase 3 Changes Required: usuń `web/src/app/app.spec.ts` (leftover CLI scaffold) lub zaktualizuj TestBed z mock OAuthService i popraw asercję.
- **Decision**: PENDING

### F4 — environment.ts nie istnieje - brak kroku ng generate environments

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny trade-off; decyzja o podejściu
- **Dimension**: Plan Completeness
- **Location**: Phase 2 punkt 2 — environment.ts
- **Detail**: Angular CLI 17+ nie generuje environment files domyślnie. Bez `ng generate environments` brak `fileReplacements` w angular.json = prod build nie podmienia environment.prod.ts. Plan mówił "może nie istnieć - stwórz" bez instrukcji generowania.
- **Fix applied**: Dodano instrukcję `cd web && ng generate environments` jako pierwszy krok Phase 2 punkt 2.
- **Decision**: FIXED

### F5 — Niespójny API providera OIDC

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — oczywista poprawka, wąski zakres
- **Dimension**: Plan Completeness
- **Location**: Phase 2 punkt 3 — app.config.ts
- **Detail**: Plan używał `importProvidersFrom(OAuthModule.forRoot())` - NgModule wrapper, nadmiarowy dla Angular 21 standalone. Kanoniczne API to `provideOAuthClient()`.
- **Fix applied**: Zmieniono na `provideOAuthClient()` w Phase 2 punkt 3.
- **Decision**: FIXED

### F6 — anyRequest().permitAll() future footgun

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — oczywista poprawka, wąski zakres
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 punkt 2 — SecurityConfig
- **Detail**: Reguła `anyRequest().permitAll()` jest celowa dla SPA, ale nie udokumentowana jako konwencja. Przyszłe endpointy Spring poza /api/** będą domyślnie publiczne.
- **Fix applied**: Dodano explicit note w Critical Implementation Details.
- **Decision**: FIXED

### F7 — src/test/resources/application.properties z fake jwk-set-uri mniej idiomatyczne

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — oczywista poprawka, wąski zakres
- **Dimension**: Plan Completeness
- **Location**: Phase 1 punkt 3 — test application.properties
- **Detail**: `@MockBean JwtDecoder` jest czystszym rozwiązaniem niż fake jwk-set-uri. Z `@MockBean` Spring `JwtDecoderAutoConfiguration` w ogóle nie odpala (jest `@ConditionalOnMissingBean`).
- **Fix**: Plan już wspomina `@MockBean JwtDecoder` jako fallback - odwróć kolejność: `@MockBean JwtDecoder` jako pierwsze rozwiązanie, plik test properties zbędny.
- **Decision**: PENDING
