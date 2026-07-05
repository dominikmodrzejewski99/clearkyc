---
date: 2026-07-01T20:00:00+02:00
researcher: Claude Sonnet 4.6
git_commit: 27145784f92a2c47fa189354c5332b5f03128bf8
branch: main
repository: clearkyc
topic: "Deploy ClearKYC na Fly.io — demoday 10xdevs"
tags: [research, deployment, fly-io, auth0, angular, spring-boot, postgres]
status: complete
last_updated: 2026-07-01
last_updated_by: Claude Sonnet 4.6
---

# Research: Deploy ClearKYC na Fly.io — demoday 10xdevs

**Date**: 2026-07-01T20:00:00+02:00
**Git Commit**: 27145784f92a2c47fa189354c5332b5f03128bf8
**Branch**: main
**Repository**: clearkyc

## Research Question

Chcę zrobić deploy tej aplikacji na demoday na zaliczenie 10xdevs. Cel: pełny flow live (upload PDF → streaming ekstrakcji → decyzja KYB).

## Summary

Aplikacja jest w zaawansowanym stanie gotowości. Fly.io i CI/CD są w połowie skonfigurowane — `fly.toml`, workflow GitHub Actions i sekret `FLY_API_TOKEN` już istnieją, ale aplikacja na Fly.io **jeszcze nie została utworzona**. Angular SPA jest w pełni zintegrowany z Maven i trafi do JAR automatycznie. Baza danych (4 migracje Flyway) jest kompletna i gotowa. Jedyny ręczny bloker to `environment.prod.ts` z placeholderami Auth0, który wymaga uzupełnienia przed buildem.

**Szacowany czas do deployu: 30-60 minut** (przy posiadaniu konta Fly.io i Auth0).

## Detailed Findings

### 1. Stan Fly.io i CI/CD

**Co istnieje:**
- `fly.toml` z pełną konfiguracją: `app = "clearkyc"`, region `fra`, Paketo buildpacks + Java 21, healthcheck na `/actuator/health`, min 1 maszyna
- `.github/workflows/fly-deploy.yml`: deploy na każdy push do `main`, używa `FLY_API_TOKEN`
- Sekret `FLY_API_TOKEN` w GitHub — ustawiony 2026-05-20

**Co brakuje:**
- Aplikacja `clearkyc` na Fly.io **nie istnieje** (trzeba `flyctl apps create`)
- Baza PostgreSQL na Fly.io **nie istnieje** (trzeba `flyctl postgres create`)
- `flyctl` nie jest zalogowany lokalnie (wymagane `flyctl auth login` do setup'u)

**Dobra wiadomość**: Po jednorazowym setup'ie (pkt. niżej), każdy push do `main` deployuje automatycznie.

### 2. Zmienne środowiskowe — czego brakuje

6 zmiennych musi być ustawionych jako sekrety Fly.io:

| Zmienna | Wartość | Krytyczność |
|---|---|---|
| `AUTH0_ISSUER_URI` | `https://dev-3kjr48h52rpcpqhv.us.auth0.com/` | KRYTYCZNA |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host>:5432/clearkyc` | KRYTYCZNA |
| `SPRING_DATASOURCE_USERNAME` | z Fly.io Postgres | KRYTYCZNA |
| `SPRING_DATASOURCE_PASSWORD` | z Fly.io Postgres | KRYTYCZNA |
| `GOOGLE_GENAI_API_KEY` | masz klucz — wstaw | KRYTYCZNA (app nie startuje bez tego) |
| `ALLOWED_ORIGINS` | `https://clearkyc.fly.dev` | Niska (SPA i API są same-origin) |

`SPRING_PROFILES_ACTIVE=prod` i `SERVER_PORT=8080` są już w `fly.toml` — nie trzeba ich ustawiać.

### 3. Bloker: environment.prod.ts z placeholderami

`web/src/environments/environment.prod.ts` zawiera:
```typescript
export const environment = {
  production: true,
  skipAuth: false,
  auth0: {
    domain: 'REPLACE_ME_AUTH0_DOMAIN',      // ← BLOKER
    clientId: 'REPLACE_ME_CLIENT_ID',        // ← BLOKER
    audience: 'REPLACE_ME_AUDIENCE',         // ← BLOKER
  },
};
```

Auth0 tenant **już istnieje** — dane są w `environment.ts` (dev):
- `domain`: `dev-3kjr48h52rpcpqhv.us.auth0.com`
- `clientId`: `waNYiWlXzAxogZEudesES33AQWTPDyl4`
- `audience`: `http://localhost:1999` (to jest tylko identyfikator API w Auth0, nie musi być URL-em live)

Dla demoday możesz reużyć tego samego tenantu — tylko dodaj `https://clearkyc.fly.dev` jako Allowed Callback URL w Auth0 Dashboard.

### 4. Angular SPA — w pełni zintegrowany

- `angular.json` ustawia `outputPath.base` na `../src/main/resources/static/`
- Maven Frontend Plugin (`frontend-maven-plugin v1.15.1`) w fazie `generate-resources` instaluje Node 24 i uruchamia `ng build --configuration production`
- `SpaController.java` obsługuje SPA routing (fallback na `index.html`)
- Fly.io Paketo buildpack wykrywa `pom.xml` → uruchamia Maven → buduje Angular → pakuje do JAR

**Nic nie trzeba robić** — `mvn package` (który Paketo uruchamia automatycznie) kompiluje cały stack.

### 5. Baza danych i Flyway — gotowe

- 4 migracje: `V1__create_case_and_audit_tables`, `V2__add_entity_name`, `V3__add_pdf_data`, `V4__add_analyst_identity`
- Schema 100% zgodna z encjami JPA — `ddl-auto=validate` zadziała
- Flyway uruchomi migracje automatycznie przy pierwszym starcie na Fly.io Postgres

## Deployment Plan — Step by Step

### Krok 0: Uzupełnij environment.prod.ts (ZRÓB TERAZ, przed wszystkim)

```typescript
// web/src/environments/environment.prod.ts
export const environment = {
  production: true,
  skipAuth: false,
  auth0: {
    domain: 'dev-3kjr48h52rpcpqhv.us.auth0.com',
    clientId: 'waNYiWlXzAxogZEudesES33AQWTPDyl4',
    audience: 'http://localhost:1999',
  },
};
```

W Auth0 Dashboard → Applications → Twoja aplikacja → dodaj do Allowed Callback URLs:
`https://clearkyc.fly.dev`

### Krok 1: Setup Fly.io (jednorazowy)

```bash
# Logowanie
flyctl auth login

# Utwórz aplikację
flyctl apps create clearkyc

# Utwórz bazę PostgreSQL
flyctl postgres create --name clearkyc-db --region fra
# Zapisz: hostname, username, password z outputu!

# Podłącz bazę do aplikacji (ustawi DATABASE_URL, ale Spring wymaga JDBC format)
flyctl postgres attach clearkyc-db --app clearkyc
```

### Krok 2: Ustaw sekrety

```bash
flyctl secrets set \
  AUTH0_ISSUER_URI="https://dev-3kjr48h52rpcpqhv.us.auth0.com/" \
  SPRING_DATASOURCE_URL="jdbc:postgresql://<hostname-z-kroku-1>:5432/clearkyc" \
  SPRING_DATASOURCE_USERNAME="<username-z-kroku-1>" \
  SPRING_DATASOURCE_PASSWORD="<password-z-kroku-1>" \
  GOOGLE_GENAI_API_KEY="<twoj-klucz>" \
  --app clearkyc
```

Uwaga: hostname to wewnętrzny adres Fly.io sieci (np. `clearkyc-db.flycast`).

### Krok 3: Trigger deploy

```bash
git add web/src/environments/environment.prod.ts
git commit -m "fix(deploy): fill Auth0 prod environment values"
git push origin main
# GitHub Actions → flyctl deploy → Paketo build → deploy
```

### Krok 4: Weryfikacja

```bash
flyctl logs --app clearkyc --follow
# Szukaj: "Started ClearkycApplication" i "Successfully applied X migration(s)"

flyctl status --app clearkyc
# Sprawdź czy maszyna jest healthy

curl https://clearkyc.fly.dev/actuator/health
# Oczekiwane: {"status":"UP"}
```

## Code References

- `fly.toml` — konfiguracja Fly.io (buildpacks, healthcheck, region)
- `.github/workflows/fly-deploy.yml` — CI/CD trigger na push do main
- `web/src/environments/environment.prod.ts` — BLOKER (placeholdery Auth0)
- `web/src/environments/environment.ts` — istniejące dane Auth0 do skopiowania
- `web/angular.json:25-27` — outputPath do Spring static resources
- `pom.xml:128-158` — Maven Frontend Plugin (buduje Angular)
- `src/main/java/com/example/clearkyc/web/SpaController.java` — SPA routing fallback
- `src/main/resources/application.properties` — env var mappings z defaults
- `src/main/resources/db/migration/` — 4 migracje Flyway (V1-V4)
- `src/main/java/com/example/clearkyc/config/SecurityConfig.java:40` — ALLOWED_ORIGINS

## Architecture Insights

- **Monorepo-in-JAR**: Angular SPA jest wbudowany w Spring Boot JAR. SPA i API są na tym samym origin (`https://clearkyc.fly.dev`). CORS nie jest problemem.
- **Auth0 dev tenant = wystarczy na demo**: Tenant `dev-3kjr48h52rpcpqhv.us.auth0.com` już istnieje. Wystarczy dodać prod callback URL.
- **Paketo buildpacks**: Nie potrzeba Dockerfile. Fly.io wykrywa Java projekt, buduje go przez Maven (który buduje też Angular), tworzy layered image.
- **Flyway auto-migration**: Migracje uruchamiają się przy starcie. Na nowej bazie Fly.io Postgres wszystkie V1-V4 zostaną zaaplikowane automatycznie.
- **skipAuth: true w dev**: Angular dev build pomija auth — to dlatego lokalne demo działało bez Auth0.

## Open Questions

1. Czy masz konto na Fly.io? Jeśli tak — czy znasz organizację (`--org` dla `flyctl apps create`)?
2. Czy hostname Fly.io Postgres po `postgres attach` jest w formacie `.flycast` (private networking) czy `.fly.dev`? Wpłynie to na format `SPRING_DATASOURCE_URL`.
3. Czy chcesz `ALLOWED_ORIGINS=https://clearkyc.fly.dev` ustawić (defensywnie), czy pominąć?
