# Auth Scaffold (F-01) — Plan Brief

> Full plan: `context/changes/auth-scaffold/plan.md`

## What & Why

Implementacja pełnej warstwy uwierzytelnienia: Spring Security jako OAuth2 Resource Server walidujący JWT wystawione przez Auth0, oficjalny SDK `@auth0/auth0-angular` obsługujący login redirect, token management i check session. Bez tej warstwy wszystkie endpointy Spring i trasy Angular są efektywnie publiczne (authGuard to stub `() => true`), co blokuje S-01 i każdy kolejny wycinek wymagający tożsamości analityka.

## Starting Point

Zero klas Spring Security; `pom.xml` bez `spring-boot-starter-security`; `application.properties` bez konfiguracji OIDC. `authGuard` w Angular zawiera jawny komentarz "TODO: implement real auth check in F-01". Trasy `/cases/new` i `/cases/:id` są syntaktycznie guarded ale efektywnie publiczne.

## Desired End State

Nieuwierzytelniony użytkownik wchodzący na `http://localhost:1999/cases/new` jest automatycznie przekierowany do Auth0 Universal Login. Po zalogowaniu wraca na oryginalną trasę; SDK zarządza tokenami w pamięci i odnawia sesję przez `checkSession()`. Spring Security weryfikuje JWT i zwraca 401 dla requestów bez tokenu; `/actuator/health` pozostaje publiczny dla Fly.io health probe.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Managed IdP | Auth0 | Najlepsza dokumentacja dla Spring Boot + Angular, darmowy dev-tenant, OIDC/SAML upgrade path | Plan |
| Dev environment | Prawdziwy Auth0 dev-tenant | Zero różnicy dev/prod w security layer; brak ryzyka "działa u mnie" | Plan |
| Spring behavior (unauth) | 401 + Angular redirect | Czyste separation of concerns; standard dla SPA + REST API | Plan |
| Token storage | Pamięć (SDK default) | SDK zarządza tokenami in-memory; checkSession() przy odświeżeniu przez cookie Auth0 | Plan |
| Angular auth library | @auth0/auth0-angular | Oficjalny SDK Auth0 - AuthService, isLoading$, isAuthenticated$, loginWithRedirect() out-of-the-box | Plan |
| Login UI | Auth0 Universal Login (redirect) | Zero HTML do pisania; brak credentials w naszym kodzie; customizable w dashboard | Plan |
| Actuator | /actuator/health publiczny | Fly.io health probe wymaga; pozostałe actuatory nie eksponu PII | Plan |
| CORS | localhost:4200 dev, ALLOWED_ORIGINS env var prod | Zero CORS errors w dev, prod hermetyczny przez env var | Plan |
| Token refresh | checkSession() przez Auth0 cookie | SDK default; przy wygaśnięciu tokenu SDK pyta Auth0 silent auth przez cookie sesji | Plan |
| Tests | @WebMvcTest + @MockBean JwtDecoder | Szybkie, deterministyczne, bez zależności od Auth0 w CI | Plan |

## Scope

**In scope:**
- `pom.xml`: spring-boot-starter-security + spring-boot-starter-oauth2-resource-server
- `SecurityConfig.java`: filter chain, CORS, JWT resource server, 401 entry point
- `application-dev.properties`: Auth0 dev-tenant issuer URI
- `src/test/resources/application.properties`: mock JWK URI dla testów
- `@auth0/auth0-angular`: instalacja + `provideAuth0()` w `app.config.ts`
- `auth.guard.ts`: zamiana stubu na realną implementację z `AuthService` z SDK
- `SecurityConfigTest.java`: 3 testy reguł dostępu

**Out of scope:**
- Logout UI i endpoint Spring
- Wyświetlanie user profile / claims w interfejsie
- Enterprise SSO / SAML / corporate bank IdP (v2)
- Granularne role i permissions
- Inline login form w Angular

## Architecture / Approach

```
Przeglądarka                Angular (4200)              Spring (8081)
    |                           |                            |
    |-- GET /cases/new -------->|                            |
    |                      authGuard: !isAuthenticated()    |
    |<-- redirect Auth0 login --|                            |
    |                           |                            |
    |-- [logowanie w Auth0] -------> callback -> token ---->|
    |                           |                            |
    |-- GET /cases/new -------->|                            |
    |                      authGuard: isAuthenticated()     |
    |<-- render page ----------|                            |
    |                           |                            |
    |-- GET /api/cases -------->|-- Bearer JWT ------------>|
    |                           |              JWT decode   |
    |                           |              (Auth0 JWK)  |
    |<-- 200 data --------------|<-- 200 response ----------|
```

Spring: jedna `SecurityFilterChain` - STATELESS, CSRF off, CORS z env var, `/actuator/health` permitAll, `/api/**` authenticated, `anyRequest` permitAll (SPA files + Angular routes).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Spring Security | Resource Server aktywny, 401 na /api/**, health publiczny | Auto-discovery Auth0 OIDC endpoint wymaga sieci przy starcie (test config musi ominąć) |
| 2. Angular Auth Client | Login redirect, checkSession, realny guard z isLoading$ | @auth0/auth0-angular v2 + Angular 21 zoneless compatibility |
| 3. Testy | SecurityConfigTest 3 testy przechodzą, verify clean | @MockBean JwtDecoder może kolidować z @WebMvcTest auto-config |

**Prerequisites:** Auth0 account z SPA Application skonfigurowaną (Callback URL, Logout URL, Allowed Origins) - wymaga ręcznego kroku przed Fazą 2 manual verification.

**Estimated effort:** 2-3 sesje; Faza 1 i 2 po 1 sesji, Faza 3 krótka.

## Open Risks & Assumptions

- Auth0 free tier (7.5k MAU) wystarczy dla v1 demo - jeśli projekt skaluje do pilotu, sprawdź limity
- `@auth0/auth0-angular` domyślnie używa `checkSession()` przez hidden iframe - może nie działać w przeglądarkach blokujących third-party cookies; rozwiązanie: dodać `useRefreshTokens: true` do `provideAuth0()` gdy potrzebna trwałość sesji po zamknięciu karty
- `application-dev.properties` nie może trafić do repozytorium z prawdziwymi wartościami - dodać do `.gitignore` lub użyć placeholderów
- Projekt używa `provideZonelessChangeDetection()` - zweryfikować że UI aktualizuje się po login/logout (SDK używa RxJS, powinno działać)

## Success Criteria (Summary)

- Nieuwierzytelniony użytkownik -> `/cases/new` -> Auth0 Universal Login (nie biała strona)
- Po zalogowaniu: strona renderuje się, `curl /api/x` z tokenem zwraca 404 (nie 401)
- `./mvnw verify` zielony, `SecurityConfigTest` 3 testy przechodzą
