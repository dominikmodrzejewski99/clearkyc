# Auth Scaffold (F-01) Implementation Plan

## Overview

Implementacja warstwy uwierzytelnienia end-to-end: Spring Security jako OAuth2 Resource Server walidujący JWT wystawione przez Auth0, oficjalny SDK `@auth0/auth0-angular` obsługujący login redirect, token management i check session. Po tej zmianie każdy request do `/api/**` bez ważnego JWT zwraca 401; Angular authGuard przekierowuje nieuwierzytelnionego użytkownika do Auth0 Universal Login.

## Current State Analysis

- **Spring:** zero klas security. `pom.xml` nie ma `spring-boot-starter-security` ani `spring-boot-starter-oauth2-resource-server`. `application.properties` nie ma żadnej konfiguracji OIDC/JWT. `SpaController` serwuje SPA bez filtracji.
- **Angular:** `auth.guard.ts` to jawny stub `() => true`. Trasy `/cases/new` i `/cases/:id` są syntaktycznie guarded ale efektywnie publiczne. Brak `@auth0/auth0-angular`, brak konfiguracji providera Auth0.
- Jedyne klasy Java: `ClearkycApplication.java` (entry point), `SpaController.java` (SPA catch-all).

## Desired End State

Spring Security filter chain aktywny: `/actuator/health` publiczny, `/api/**` chroniony JWT (HTTP 401 bez tokenu), statyczne pliki SPA (`/**`) publiczne. `@auth0/auth0-angular` skonfigurowany pod Auth0 dev-tenant: nieuwierzytelniony użytkownik na `/cases/new` jest przekierowany do Auth0 Universal Login, po zalogowaniu wraca na oryginalną trasę; SDK zarządza tokenami w pamięci i odnawia sesję przez `checkSession()`. Testy integracyjne Spring Security weryfikują reguły bez połączenia z Auth0.

### Key Discoveries

- `SpaController` mapuje `/**` - Spring Security filter chain (wyższy priorytet) musi wpuszczać statyczne pliki zanim `SpaController` je obsłuży; konfiguracja `anyRequest().permitAll()` po bloku `/api/**` realizuje to bez konfliktu.
- Spring Boot 4.x: fluent DSL, `jakarta.*`, brak `WebSecurityConfigurerAdapter`. Session policy: STATELESS wymagane dla Resource Server.
- Wystawiane przez Auth0 JWT: `issuer-uri` w `application.properties` wyzwala auto-discovery OIDC (GET `/.well-known/openid-configuration`) - wymaga sieci podczas startu; testy muszą korzystać z `jwk-set-uri` do mocka lub `@MockBean JwtDecoder`.
- `ClearkycApplicationTests.contextLoads()` wywoła fail po dodaniu security bez konfiguracji test JWT decodera.
- CORS + credentials: wildcard `*` niedozwolony przez przeglądarki gdy `withCredentials: true`; CORS musi mieć jawne originy.
- `@auth0/auth0-angular` zarządza tokenami w pamięci (domyślnie) i odnawia sesję przez `checkSession()` (hidden iframe); dla trwałości między odświeżeniami strony SDK konfiguruje się z `cacheLocation: 'localstorage'` i `useRefreshTokens: true` - w tej implementacji używamy domyślnych ustawień SDK.

## What We're NOT Doing

- Przycisk logout i endpoint wylogowania (S-01)
- Wyświetlanie danych użytkownika z claims JWT (email, name) w UI (S-01)
- Enterprise SSO / SAML / corporate bank IdP (v2, jawnie poza zakresem PRD v1)
- Granularne role i permissions (PRD non-goal - jedna rola w MVP)
- Inline login form w Angular (Auth0 Universal Login wystarczy dla v1 demo)
- Osobna strona `/login` w Angular routingu

## Implementation Approach

Dwie równoległe warstwy (Spring backend + Angular frontend) implementowane sekwencyjnie faza po fazie:

1. Spring Security Resource Server z JWT i CORS - backend gotowy do weryfikacji tokenów jeszcze zanim Angular jest przepięty
2. Angular auth client - `@auth0/auth0-angular` z `provideAuth0()` w app.config.ts i realnym guard przez `AuthService` z SDK
3. Testy integracyjne Spring Security - bez połączenia z Auth0, mock JWT decoder

## Critical Implementation Details

**Spring Security filter chain ordering vs SpaController:** `SpaController` rejestruje `PathResourceResolver` na `/**` przez `WebMvcConfigurer`. Spring Security filter chain działa przed Spring MVC routing, więc reguła `anyRequest().permitAll()` w `SecurityConfig` przepuszcza request do `SpaController` bez konfliktu. Reguła `/api/**` musi być przed `anyRequest()` (Spring ewaluuje w kolejności deklaracji).

**ClearkycApplicationTests po dodaniu security:** Spring auto-konfiguracja spróbuje kontaktować się z Auth0 OIDC discovery endpoint jeśli `issuer-uri` jest ustawiony. W `src/test/resources/application.properties` ustaw `spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/test-jwks` zamiast `issuer-uri` - to pomija discovery request i pozwala testowi przejść bez sieci. `SecurityConfigTest` dostarcza `@MockBean JwtDecoder` żeby całkowicie ominąć JWT validation w testach.

**`@auth0/auth0-angular` i guard z `isLoading$`:** SDK emituje `isLoading$: true` podczas inicjalizacji (discovery OIDC, próba silent auth). Guard MUSI czekać na `filter(isLoading => !isLoading)` przed sprawdzeniem `isAuthenticated$` - inaczej niezainicjalizowany SDK odczytuje `false` i triggeruje redirect do Auth0 dla już zalogowanego użytkownika. Zaimplementowano w `auth.guard.ts` przez `isLoading$.pipe(filter, take(1), switchMap)`.

**anyRequest().permitAll() - konwencja dla przyszłych endpointów:** Reguła `anyRequest().permitAll()` istnieje wyłącznie dla SPA catch-all. Każdy przyszły Spring endpoint wymagający uwierzytelnienia MUSI być zarejestrowany pod `/api/**` - inaczej będzie domyślnie publiczny bez żadnego ostrzeżenia.

---

## Phase 1: Spring Security - Resource Server + CORS

### Overview

Dodanie zależności Spring Security do `pom.xml`, stworzenie `SecurityConfig.java` z regułami dostępu i konfiguracją CORS, aktualizacja `application.properties` i stworzenie `application-dev.properties` z danymi Auth0 dev-tenant.

### Changes Required

#### 1. Maven dependencies

**File:** `pom.xml`

**Intent:** Dodać Spring Security i OAuth2 Resource Server - minimalny zestaw do walidacji JWT. Nie dodawać OAuth2 Client (to Angular obsługuje login flow).

**Contract:** Dwie nowe zależności w bloku `<dependencies>`, bez podawania wersji (zarządzane przez Spring Boot BOM):
- `spring-boot-starter-security`
- `spring-boot-starter-oauth2-resource-server`

#### 2. SecurityConfig

**File:** `src/main/java/com/example/clearkyc/config/SecurityConfig.java` (nowy plik)

**Intent:** Zdefiniować jeden `SecurityFilterChain` bean z regułami: `/actuator/health` publiczny, `/api/**` wymaga JWT, wszystko inne (`anyRequest`) publiczne (SPA pliki + Angular routes). CSRF wyłączony (stateless JWT). Session policy STATELESS. CORS skonfigurowany z `corsConfigurationSource()` czytającym `ALLOWED_ORIGINS` env var.

**Contract:** `@Configuration @EnableWebSecurity` klasa w pakiecie `com.example.clearkyc.config`. Bean `SecurityFilterChain` deklarowany przez `HttpSecurity`. Bean `CorsConfigurationSource` z `CorsConfiguration` ustawiającą `allowedOrigins` (lista split po przecinku z `${ALLOWED_ORIGINS:http://localhost:1999}`), `allowedMethods` `[GET,POST,PUT,PATCH,DELETE,OPTIONS]`, `allowedHeaders(*)`, `allowCredentials(true)`. JWT entry point zwraca `SC_UNAUTHORIZED` (nie redirect).

Niestandardowy element warty snippetu - kolejność reguł autoryzacji:
```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/actuator/health").permitAll()
    .requestMatchers("/api/**").authenticated()
    .anyRequest().permitAll()
)
.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
```

#### 3. Application properties - główne i dev

**File:** `src/main/resources/application.properties`

**Intent:** Dodać klucz konfiguracji JWT issuer URI jako placeholder - nadpisywany przez `application-dev.properties` w profilu dev i przez zmienne środowiskowe w prod.

**Contract:** Dodać klucz `spring.security.oauth2.resourceserver.jwt.issuer-uri=\${AUTH0_ISSUER_URI}` (wartość z env var; w dev nadpisywana przez profil).

**File:** `src/main/resources/application-dev.properties` (nowy plik)

**Intent:** Konfiguracja Spring dla profilu `dev` z danymi Auth0 dev-tenant. Plik NIGDY nie trafia do repozytorium z prawdziwymi wartościami - dodać wpis do `.gitignore` lub użyć placeholderów z komentarzem.

**Contract:** Klucze:
```properties
spring.security.oauth2.resourceserver.jwt.issuer-uri=https://<twoja-domena>.auth0.com/
ALLOWED_ORIGINS=http://localhost:1999
```

**File:** `src/test/resources/application.properties` (nowy plik)

**Intent:** Konfiguracja testowa omijająca discovery request do Auth0 - Spring nie próbuje kontaktować się z zewnętrznym serwerem OIDC podczas uruchomienia testów.

**Contract:** `spring.security.oauth2.resourceserver.jwt.jwk-set-uri=http://localhost/test-jwks` - jawna JWK URI zamiast `issuer-uri`, eliminuje auto-discovery.

### Success Criteria

#### Automated Verification

- Kompilacja z nowymi zależnościami: `./mvnw compile` kończy się sukcesem
- Testy przechodzą (contextLoads nie failuje z powodu braku Auth0): `./mvnw test`

#### Manual Verification

- Auth0 account założone, nowy tenant stworzony
- Auth0 Application typu "Single Page Application" skonfigurowana:
  - Allowed Callback URLs: `http://localhost:1999`
  - Allowed Logout URLs: `http://localhost:1999`
  - Allowed Web Origins: `http://localhost:1999`
- `application-dev.properties` wypełniony prawdziwym `issuer-uri` z Auth0 dashboard
- `./mvnw spring-boot:run -Dspring.profiles.active=dev` startuje bez błędu connection do Auth0 discovery
- `curl http://localhost:8081/actuator/health` zwraca `{"status":"UP"}` (HTTP 200)
- `curl http://localhost:8081/api/test` zwraca `401 Unauthorized` (Spring Security blokuje)

**Implementation Note:** Po przejściu automated verification i manual verification tej fazy - poczekaj na potwierdzenie przed przejściem do Fazy 2.

---

## Phase 2: Angular Auth Client - @auth0/auth0-angular

### Overview

Integracja oficjalnego SDK Auth0 do Angular: instalacja `@auth0/auth0-angular`, konfiguracja `provideAuth0()` w `app.config.ts`, realna implementacja `auth.guard.ts`. SDK dostarcza `AuthService` (observables `isAuthenticated$`, `isLoading$`, `user$`), token management i `loginWithRedirect()` out-of-the-box - brak custom AuthService, custom interceptora ani environment files.

**Status:** Faza zakończona - wszystkie zmiany kodu wykonane.

### Changes Required

#### 1. @auth0/auth0-angular dependency

**File:** `web/package.json`

**Intent:** Dodać oficjalny Auth0 SDK dla Angular jako zależność runtime.

**Contract:** `"@auth0/auth0-angular": "^2.x"` w `dependencies`. SDK zainstalowany: `npm install @auth0/auth0-angular@2.x`.

#### 2. app.config.ts - provideAuth0 i HttpClient

**File:** `web/src/app/app.config.ts`

**Intent:** Zarejestrować `provideAuth0()` z danymi tenant/clientId Auth0 i `provideHttpClient()` (wymagany przez SDK).

**Contract:** Dodane do `providers`:
- `provideHttpClient()` z `@angular/common/http`
- `provideAuth0({ domain, clientId, authorizationParams: { redirect_uri: window.location.origin } })` z `@auth0/auth0-angular`

Konfiguracja Auth0 (`domain: 'dev-3kjr48h52rpcpqhv.us.auth0.com'`, `clientId: 'waNYiWlXzAxogZEudesES33AQWTPDyl4'`) jest hardcoded w `app.config.ts` - wystarczy dla v1 demo; dla prod wymagana parametryzacja przez zmienne środowiskowe lub `ng generate environments`.

#### 3. auth.guard.ts - realna implementacja

**File:** `web/src/app/core/guards/auth.guard.ts`

**Intent:** Zastąpić stub (`() => true`) realną implementacją używającą `AuthService` z SDK: czeka na zakończenie inicjalizacji SDK przez `isLoading$`, następnie sprawdza `isAuthenticated$` i wykonuje `loginWithRedirect()` dla niezalogowanych.

**Contract:** `CanActivateFn` wstrzykująca `AuthService` przez `inject()`. Pipeline: `isLoading$.pipe(filter(!isLoading), take(1), switchMap(() => isAuthenticated$), map(auth => auth || (loginWithRedirect(), false)))`.

### Success Criteria

#### Automated Verification

- TypeScript kompilacja bez błędów: `cd web && npx ng build --configuration=development`
- Production build: `cd web && npx ng build --configuration=production`

#### Manual Verification

- `cd web && npm start` uruchamia Angular dev server na porcie 4200
- Nawigacja do `http://localhost:1999/cases/new` bez aktywnej sesji -> przeglądarka przekierowuje do Auth0 Universal Login
- Logowanie w Auth0 (testowe konto) -> przekierowanie z powrotem do `http://localhost:1999/cases/new`
- Po zalogowaniu: Angular renderuje stronę bez błędów; `auth.isAuthenticated$` emituje `true` (widoczne przez Angular DevTools lub console.log w komponencie)
- `curl http://localhost:8081/api/test -H "Authorization: Bearer <token z auth.getAccessTokenSilently()>"` zwraca `404` a NIE `401` (Spring Security przepuszcza z ważnym tokenem)
- Odświeżenie strony -> SDK wykonuje `checkSession()` przez Auth0; użytkownik pozostaje zalogowany jeśli sesja Auth0 cookie jest aktywna

**Implementation Note:** Po przejściu automated i manual verification tej fazy - poczekaj na potwierdzenie przed przejściem do Fazy 3.

---

## Phase 3: Spring Security Integration Tests

### Overview

Testy integracyjne warstwy Spring Security bez zewnętrznego połączenia do Auth0. `SecurityConfigTest` weryfikuje kluczowe reguły dostępu przez MockMvc. Aktualizacja `ClearkycApplicationTests` pod nowy security context.

### Changes Required

#### 1. SecurityConfigTest

**File:** `src/test/java/com/example/clearkyc/security/SecurityConfigTest.java` (nowy plik)

**Intent:** Zweryfikować trzy reguły bezpieczeństwa: (a) `/actuator/health` dostępny bez tokenu, (b) `/api/**` zwraca 401 bez tokenu, (c) `/api/**` zwraca inny status (nie 401) z mock JWT. Bez połączenia z Auth0.

**Contract:** `@WebMvcTest` z `@MockBean JwtDecoder` (ominięcie walidacji JWT) i `@Import(SecurityConfig.class)`. Trzy testy:
1. `GET /actuator/health` -> status `2xx`
2. `GET /api/nonexistent` bez auth -> status `401`
3. `GET /api/nonexistent` z `@WithMockUser` -> status `4xx` ale NIE `401` (Spring przepuszcza, routing nie znajduje trasy -> 404)

#### 2. ClearkycApplicationTests

**File:** `src/test/java/com/example/clearkyc/ClearkycApplicationTests.java`

**Intent:** Upewnić się że `contextLoads()` nadal przechodzi po dodaniu Spring Security. Plik `src/test/resources/application.properties` z fałszywą `jwk-set-uri` powinien wystarczyć; jeśli test nadal failuje, dodać `@MockBean JwtDecoder` do klasy testowej.

**Contract:** Zmiana minimalna - tylko jeśli `contextLoads()` failuje po Fazie 1. Dodaj `@MockBean JwtDecoder` jako pole klasy - to jedyna zmiana.

### Success Criteria

#### Automated Verification

- Wszystkie testy przechodzą: `./mvnw test`
- `SecurityConfigTest` przechodzi z trzema zielonymi testami
- `ClearkycApplicationTests.contextLoads()` przechodzi

#### Manual Verification

- `./mvnw verify` (compile + test + package) kończy się sukcesem
- Finalny smoke test e2e: pełny flow login w przeglądarce z obu warstw działających jednocześnie (`./mvnw spring-boot:run -Dspring.profiles.active=dev` + `cd web && ng serve`)

---

## Testing Strategy

### Unit / Integration Tests

- `SecurityConfigTest`: MockMvc + `@MockBean JwtDecoder` - reguły dostępu bez sieci
- `ClearkycApplicationTests`: kontekst Spring ładuje się z mock JWT decoder

### Manual Testing Steps

1. Auth0 dashboard: sprawdź Allowed Callback URLs, Logout URLs, Web Origins
2. Nie zalogowany -> `/cases/new` -> Auth0 login page (przeglądarka)
3. Zaloguj się -> powrót do `/cases/new` bez błędu
4. DevTools Application tab -> sessionStorage -> klucze `access_token`/`id_token` widoczne
5. `curl /api/nonexistent` bez tokenu -> 401
6. `curl /api/nonexistent` z tokenem z sessionStorage -> 404 (nie 401)
7. Zamknij kartę, otwórz ponownie -> wymaga ponownego logowania (sessionStorage wyczyszczony)

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-001, Access Control)
- Tech stack: `context/foundation/tech-stack.md`
- Spring Boot 4.x Security docs: `https://docs.spring.io/spring-boot/4.0.6/reference/web/spring-security.html`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Spring Security - Resource Server + CORS

#### Automated

- [x] 1.1 `./mvnw compile` - kompilacja z nowymi zależnościami Security i Resource Server
- [x] 1.2 `./mvnw test` - ClearkycApplicationTests.contextLoads() przechodzi z test JWK URI

#### Manual

- [x] 1.3 Auth0 account + SPA Application skonfigurowana (Callback URL, Logout URL, Web Origins)
- [x] 1.4 `application-dev.properties` wypełniony prawdziwym `issuer-uri` z Auth0 dashboard
- [x] 1.5 `curl http://localhost:8081/actuator/health` -> HTTP 200
- [x] 1.6 `curl http://localhost:8081/api/test` -> HTTP 401

### Phase 2: Angular Auth Client - @auth0/auth0-angular

#### Automated

- [x] 2.1 `ng build --configuration=development` - zero błędów TypeScript
- [ ] 2.2 `ng build --configuration=production` - clean production build

#### Manual

- [ ] 2.3 Nieuwierzytelniona nawigacja do `/cases/new` -> redirect do Auth0 Universal Login
- [ ] 2.4 Login w Auth0 -> powrót na `/cases/new` bez błędu
- [ ] 2.5 Po zalogowaniu Angular renderuje stronę; auth.isAuthenticated$ emituje true
- [ ] 2.6 `curl /api/test -H "Authorization: Bearer <token>"` -> 404 (nie 401)
- [ ] 2.7 Odświeżenie strony -> SDK wykonuje checkSession(), sesja aktywna przy żywym cookie Auth0

### Phase 3: Spring Security Integration Tests

#### Automated

- [ ] 3.1 `SecurityConfigTest` - trzy testy przechodzą (health 200, api 401, api+auth nie-401)
- [ ] 3.2 `./mvnw verify` - compile + test + package pełny sukces

#### Manual

- [ ] 3.3 Pełny smoke test e2e: obie warstwy uruchomione jednocześnie, login flow end-to-end
