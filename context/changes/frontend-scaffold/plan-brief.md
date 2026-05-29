# Frontend Scaffold (F-03) — Plan Brief

> Full plan: `context/changes/frontend-scaffold/plan.md`

## What & Why

Scaffoldujemy Angular 21 SPA w `web/` jako infrastrukturę pod wszystkie UI-wycinki ClearKYC. Bez tego foundation żaden slice (S-01, S-02, S-03) nie ma gdzie wylądować. F-03 jest prerequisitem dla S-01 (minimalny rdzen przypadku).

## Starting Point

Repozytorium ma Spring Boot 4.0.6 z `src/main/resources/static/` pustym, brak `web/`, brak `package.json`. Fly.io używa Paketo buildpack uruchamiającego `./mvnw package` - frontend musi być wbudowany przez Maven.

## Desired End State

`./mvnw package` buduje JAR zawierający skompilowane Angular SPA; Spring serwuje SPA na `/`. `ng serve` startuje z proxy do `:8080`. Nawigacja do `/cases/new` i `/cases/:id` renderuje split-panel layout (lewy: PDF placeholder, prawy: form placeholder) przy HTML5 routing działającym zarówno przez `ng serve` jak i przez Spring.

## Key Decisions Made

| Decyzja | Wybor | Dlaczego |
|---------|-------|----------|
| Angular version | 21 (standalone, zoneless) | Najnowsza; signals stabilne; brak zone.js overhead przy SSE streaming |
| Serving strategy | Spring serwuje SPA (Maven Frontend Plugin) | Zero zmian w Fly.io pipeline; jeden proces, jeden port |
| Change detection | Zoneless (experimental) | Lepsza wydajnosc przy SSE streaming w S-01/F-04 |
| CSS | SCSS + BEM + design system (tokeny CSS) | Spoisty design system od startu; wszystkie wartosci przez `var(--token)` |
| Split panel | CSS flex + SCSS BEM variables (placeholder) | Resizability w S-01; F-03 tylko fundament |
| Auth guard | Stub `canActivate: () => true` | F-01 wypelni implementacje; routing gotowy bez blokatora |
| Node version | v24.0.0 | Aktualny; Angular 21 wymaga Node 20+ |
| Build pipeline | frontend-maven-plugin (Node embedded w Maven) | Paketo buildpack bez zmian; `./mvnw package` buduje wszystko |

## Scope

**In scope:**
- `ng new web` z Angular 21, standalone, zoneless, SCSS
- Design system: `_variables.scss` (tokeny kolorow, spacing, typografii), `_reset.scss`, `_mixins.scss`
- `frontend-maven-plugin` w `pom.xml` (Node 24, `npm ci`, `ng build`)
- `angular.json` outputPath → `../src/main/resources/static` (bez `browser/` subdirectory)
- `proxy.conf.json` dla `ng serve` → `:8080`
- `SpaController` w Spring (catch-all HTML5 routing dla 1-2 poziomowych tras)
- Routing: `/cases/new`, `/cases/:id`, redirect z `/`
- `AppLayoutComponent` z CSS flex split-panel, BEM, tokeny z design systemu
- `AuthGuard` stub (zawsze `true`, TODO: F-01)
- Placeholder `NewCaseComponent`, `CaseDetailComponent`

**Out of scope:**
- Logika biznesowa (upload PDF, ekstrakcja, decyzja) - S-01
- Implementacja auth - F-01
- Resizable/draggable split-panel - S-01/S-02
- Angular Material ani zewnetrzne biblioteki komponentow
- Dockerfile, zmiany w fly.toml

## Architecture / Approach

Maven Frontend Plugin instaluje Node 24 lokalnie (w `target/node/`) i uruchamia `ng build --configuration production` podczas `./mvnw package`. Angular build output trafia bezposrednio do `src/main/resources/static/` (przez `outputPath.browser: ""`). Spring ResourceHttpRequestHandler serwuje pliki statyczne; `SpaController` przekierowuje nieznane trasy do `index.html`. Podczas developmentu `ng serve` z `proxy.conf.json` przekierowuje `/api/**` i `/actuator/**` do Spring na `:8080`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|-------|-----------------|----------|
| 1. Angular scaffold | `ng build` przechodzi; design system z tokenami CSS | Zoneless config musi wykluczyc zone.js z polyfills |
| 2. Maven integration | `./mvnw package` buduje JAR z Angular inside | outputPath.browser musi byc `""` - inaczej `browser/` subdirectory lamie Spring |
| 3. Proxy + SPA routing | Dev proxy dziala; Spring nie zwraca 404 na Angular routes | SPA controller regex musi wykluczyc rozszerzenia plikow |
| 4. Routing + Layout + Guard | Split-panel renderuje; routing dziala end-to-end | TypeScript i Angular build musza przejsc z nowymi komponentami |

**Prerequisites:** Brak - F-03 jest niezalezny (gotowy od razu per roadmap)
**Estimated effort:** 1-2 sesje; 4 fazy sekwencyjne

## Open Risks & Assumptions

- Node 24.0.0 - uzywamy pierwszej wersji v24; jesli jest patch (v24.1.0 etc.) uzytkownik moze zaktualizowac w `pom.xml`
- `provideExperimentalZonelessChangeDetection` jest API eksperymentalnym - moze sie zmienic w Angular 22+
- Paketo buildpack pobiera Node przez internet podczas buildu CI/CD - wymaga polaczenia sieciowego w GitHub Actions runner (standardowe)

## Success Criteria (Summary)

- `./mvnw package -DskipTests && java -jar target/clearkyc-*.jar` - Spring serwuje Angular SPA na `http://localhost:8080/`
- `cd web && npm start` - `http://localhost:4200/actuator/health` przez proxy zwraca 200
- `http://localhost:4200/cases/new` i `/cases/abc123` - split-panel z placeholderami renderuje; refresh przez Spring rowniez dziala
