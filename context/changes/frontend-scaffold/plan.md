# Frontend Scaffold (F-03) Implementation Plan

## Overview

Scaffoldujemy Angular 21 SPA w `web/` jako foundation dla wszystkich UI-wycinków ClearKYC. SPA serwowane jest przez Spring Boot z plików statycznych zbudowanych przez Maven Frontend Plugin - jeden proces, jeden port, zero zmian w Fly.io pipeline. Wynikiem jest pusty szkielet z routingiem, split-panel layoutem i design systemem gotowy do wypełnienia w S-01.

## Current State Analysis

- Brak `web/` - zero frontendu w repozytorium
- Spring Boot 4.0.6 (Jakarta) serwuje wyłącznie `/actuator/health`; `src/main/resources/static/` puste
- Fly.io deployment: Paketo buildpack (`paketobuildpacks/builder-jammy-base`), uruchamia `./mvnw package` wewnątrz buildera - musi on obsłużyć frontend build
- CI/CD: `flyctl deploy --local-only` - buildpack działa lokalnie/na runnerzee GitHub Actions
- `pom.xml`: brak `frontend-maven-plugin`, brak Node w projekcie
- Angular-pitfalls: `provideAnimationsAsync()` deprecated od v20.2 - nie dodawać; statyczne pliki do `public/`, nie `src/assets/`; `takeUntilDestroyed(this.destroyRef)` w każdym `subscribe()`

## Desired End State

Po ukończeniu planu:
- `cd web && ng build --configuration production` przechodzi bez błędów
- `./mvnw package` buduje JAR ze skompilowanym Angular wewnątrz (Spring serwuje SPA na `/`)
- `cd web && npm start` startuje `ng serve` z proxy do `:8080`; GET `/actuator/health` przez proxy zwraca 200
- Nawigacja do `http://localhost:4200/cases/new` renderuje split-panel layout (dwa puste panele: PDF i form)
- Nawigacja do `http://localhost:8080/cases/new` (przez Spring) - Spring zwraca `index.html`, nie 404
- Angular routes `/cases/new` i `/cases/:id` chronione przez stub AuthGuard (zawsze `true`; TODO: F-01)

### Key Discoveries:

- `frontend-maven-plugin` uruchamia `npm ci` + `ng build` jako część fazy `generate-resources` Mavena - Paketo buildpack nie wymaga modyfikacji bo widzi tylko Maven
- Angular 21 outputPath musi być skonfigurowany jako `{ "base": "../src/main/resources/static", "browser": "" }` - bez `browser: ""` pliki lądują w `static/browser/index.html`, nie w `static/index.html`, co łamie Spring resource handler
- Spring SPA catch-all: regex `[^\\.]*` w `@GetMapping` wyklucza URLe z rozszerzeniami (`.js`, `.css`) - statyczne assety obsługuje ResourceHttpRequestHandler automatycznie
- Zoneless: `provideExperimentalZonelessChangeDetection()` wymaga usunięcia `"zone.js"` z polyfills w `angular.json`; bez tego zona i zoneless change detection walczą
- `src/main/resources/static/` NIE commitujemy - to generated output; do `.gitignore`

## What We're NOT Doing

- Żadnej logiki biznesowej (upload PDF, ekstrakcja, decyzja) - to S-01
- Żadnej implementacji auth - stub guard tylko; F-01 go wypełni
- Angular Material ani żadnej biblioteki komponentów - czyste SCSS + BEM
- Resizable/draggable split-panel - statyczny CSS flex placeholder; interaktywność w S-01/S-02
- Osobny hosting Angular (CDN) - Spring serwuje SPA
- Dockerfile - pozostajemy przy Paketo buildpack

## Implementation Approach

Cztery niezależne fazy, każda weryfikowalna osobno:

1. `ng new web` tworzy bazę; konfigurujemy zoneless i design system (tokeny CSS)
2. `frontend-maven-plugin` integruje `ng build` z Maven; outputPath wskazuje na `static/`
3. `proxy.conf.json` dla dev-proxy; `SpaController` w Spring dla HTML5 routing w produkcji
4. Routing (`/cases/new`, `/cases/:id`), `AppLayoutComponent` (split-panel BEM), stub guard

## Critical Implementation Details

**outputPath bez `browser/` subdirectory**: W `angular.json` ustaw `"outputPath": { "base": "../src/main/resources/static", "browser": "" }` (pusty string `browser`). Bez tego Angular 21 domyślnie generuje `static/browser/index.html`, co Spring serwuje jako `/browser/index.html`, nie `/` - SPA nie startuje.

**Zoneless + zone.js**: Po włączeniu `provideExperimentalZonelessChangeDetection()` usuń `"zone.js"` z tablicy `polyfills` w `angular.json`. Pozostawienie obu powoduje podwójny change detection i ostrzeżenia runtime o konflikcie.

**SPA catch-all vs static assets**: Spring serwuje pliki ze `classpath:/static/` automatycznie przez `ResourceHttpRequestHandler` - nadpisanie tego mappingiem `/**` zepsuje delivery JS/CSS. `SpaController` musi używać regex wykluczającego rozszerzenia: `@GetMapping({"/{p:[^\\.]*}", "/{p1:[^\\.]*}/{p2:[^\\.]*}"})`.

---

## Phase 1: Angular SPA scaffold z design systemem

### Overview

Inicjalizujemy Angular 21 SPA w `web/`, włączamy zoneless change detection, tworzymy strukturę design systemu (SCSS tokeny BEM), aktualizujemy `.gitignore`.

### Changes Required:

#### 1. Angular CLI - inicjalizacja projektu

**File**: `web/` (katalog tworzony przez `ng new`)

**Intent**: Uruchomić `ng new web --routing --style scss --ssr=false` z katalogu root projektu. Tworzy standalone Angular 21 SPA z routingiem i SCSS.

**Contract**: Rezultat: `web/` zawiera `package.json`, `angular.json`, `src/app/app.config.ts`, `src/app/app.routes.ts`, `src/styles.scss`. Standalone components domyślnie - nie dodawać NgModule.

#### 2. Zoneless change detection

**File**: `web/src/app/app.config.ts`

**Intent**: Zastąpić `provideZoneChangeDetection` przez `provideExperimentalZonelessChangeDetection()` i usunąć `provideAnimationsAsync` (deprecated od v20.2 per angular-pitfalls).

**Contract**: `appConfig.providers` zawiera `provideExperimentalZonelessChangeDetection()` i `provideRouter(routes)`. Brak `provideZoneChangeDetection`, brak `provideAnimationsAsync`.

#### 3. Usunięcie zone.js z polyfills

**File**: `web/angular.json`

**Intent**: Usunąć `"zone.js"` z tablicy `polyfills` w sekcji `build.options`. Przy włączonym zoneless zone.js tworzy konflikt change detection.

**Contract**: `projects.web.architect.build.options.polyfills` jest pustą tablicą `[]` lub nie zawiera `"zone.js"`.

#### 4. Design system - zmienne i tokeny

**File**: `web/src/styles/design-system/_variables.scss` (nowy)

**Intent**: Zdefiniować CSS custom properties (design tokens) jako fundament całego UI ClearKYC - kolory, spacing, typografia, radii. Wszystkie komponenty referują tokeny, nigdy surowe wartości hex.

**Contract**: Plik zawiera sekcje `:root { }` z tokenami:
- Kolory: hierarchia powierzchni (`--color-surface-*`), tekst (`--color-text-*`), border (`--color-border-*`), akcent (`--color-accent-*`), statusy case (`--color-status-approve`, `--color-status-reject`, `--color-status-escalate`)
- Spacing: skala bazująca na 4px (`--space-1` do `--space-16` lub named sizes xs-2xl)
- Typografia: font-family, size scale (`--font-size-xs` do `--font-size-2xl`), weights, line-heights
- Radii: `--radius-sm`, `--radius-md`, `--radius-lg`

Tokeny odzwierciedlają banking dashboard UI: wysoką gęstość informacji, profesjonalny design.

#### 5. Design system - reset

**File**: `web/src/styles/design-system/_reset.scss` (nowy)

**Intent**: Minimal CSS reset - box-sizing: border-box, usunięcie domyślnych marginesów, normalize dla elementów formularzy.

**Contract**: `*, *::before, *::after { box-sizing: border-box }` + reset dla `body`, `h1-h6`, `p`, `button`, `input`, `select`.

#### 6. Design system - mixiny

**File**: `web/src/styles/design-system/_mixins.scss` (nowy)

**Intent**: SCSS mixiny wielokrotnego użytku dla layoutu i wzorców BEM. Nie polyfillujemy CSS - tylko mixiny specyficzne dla ClearKYC.

**Contract**: Zawiera co najmniej: `@mixin flex-panel` (flex container pełnej wysokości), `@mixin panel-placeholder` (styl visual placeholder dla niepustych paneli), `@mixin truncate` (text-overflow ellipsis).

#### 7. Globalny entry point stylów

**File**: `web/src/styles.scss`

**Intent**: Zaimportować cały design system w kolejności: reset → zmienne → mixiny. Ustawić globalne style body.

**Contract**: `@use 'styles/design-system/reset'; @use 'styles/design-system/variables'; @use 'styles/design-system/mixins';` + globalne style dla `body` używające tokenów (`font-family`, `background-color`, `color`).

#### 8. Aktualizacja .gitignore

**File**: `.gitignore`

**Intent**: Wykluczyć generowane katalogi frontendu i wygenerowane pliki statyczne z commita.

**Contract**: Plik zawiera wpisy: `web/node_modules/`, `web/dist/`, `web/.angular/`, `src/main/resources/static/`.

### Success Criteria:

#### Automated Verification:

- `cd web && ng build` exits 0 (bez błędów kompilacji TypeScript i SCSS)
- `cd web && ng build --configuration production` exits 0
- `test -f web/src/styles/design-system/_variables.scss` - plik tokenów istnieje

#### Manual Verification:

- Przejrzeć `_variables.scss`: tokeny kolorów mają sensowne wartości dla banking dashboard
- Brak `provideAnimationsAsync` w `app.config.ts`
- `angular.json` nie zawiera `"zone.js"` w polyfills

---

## Phase 2: Maven Frontend Plugin - integracja buildu

### Overview

Podpinamy `frontend-maven-plugin` do `pom.xml` - Maven instaluje Node 20.18.0 LTS, uruchamia `npm ci` i `ng build --configuration production` podczas `./mvnw package`. Angular build output trafia do `src/main/resources/static/` (włączone do JAR Springa).

### Changes Required:

#### 1. Konfiguracja outputPath w angular.json

**File**: `web/angular.json`

**Intent**: Wskazać katalog wyjściowy buildu na `../src/main/resources/static` bez subdirectory `browser/` - Spring serwuje pliki bezpośrednio z root `static/`.

**Contract**:
```json
"outputPath": {
  "base": "../src/main/resources/static",
  "browser": ""
}
```
W sekcji `projects.web.architect.build.options`. `browser: ""` jest krytyczne - pusty string pomija domyślny subdirectory `browser/`.

#### 2. Build script w package.json

**File**: `web/package.json`

**Intent**: Upewnić się, że skrypt `"build"` uruchamia `ng build --configuration production` (Maven wywołuje `npm run build`).

**Contract**: `scripts.build` = `"ng build --configuration production"`. Skrypt `"start"` = `"ng serve --proxy-config proxy.conf.json"` (wyprzedzamy Phase 3; `proxy.conf.json` nie istnieje jeszcze - start skryptu jest tylko definicją).

#### 3. frontend-maven-plugin w pom.xml

**File**: `pom.xml`

**Intent**: Dodać `frontend-maven-plugin` do sekcji `<build><plugins>`, który w fazie `generate-resources` instaluje Node 20.18.0 LTS, uruchamia `npm ci` i `npm run build` w katalogu `web/`.

**Contract**:

```xml
<plugin>
    <groupId>com.github.eirslett</groupId>
    <artifactId>frontend-maven-plugin</artifactId>
    <version>1.15.1</version>
    <configuration>
        <workingDirectory>web</workingDirectory>
        <installDirectory>target/node</installDirectory>
    </configuration>
    <executions>
        <execution>
            <id>install-node-and-npm</id>
            <phase>generate-resources</phase>
            <goals><goal>install-node-and-npm</goal></goals>
            <configuration>
                <nodeVersion>v24.0.0</nodeVersion>
            </configuration>
        </execution>
        <execution>
            <id>npm-install</id>
            <phase>generate-resources</phase>
            <goals><goal>npm</goal></goals>
            <configuration><arguments>ci</arguments></configuration>
        </execution>
        <execution>
            <id>ng-build</id>
            <phase>generate-resources</phase>
            <goals><goal>npm</goal></goals>
            <configuration><arguments>run build</arguments></configuration>
        </execution>
    </executions>
</plugin>
```

Trzy execution: instalacja Node, npm ci, ng build. Wszystkie w fazie `generate-resources` (przed `compile`/`package`).

### Success Criteria:

#### Automated Verification:

- `./mvnw package -DskipTests` exits 0 (pobiera Node, instaluje npm deps, uruchamia ng build, buduje JAR)
- `test -f src/main/resources/static/index.html` po `./mvnw package`
- `ls src/main/resources/static/*.js` zwraca przynajmniej jeden plik JS (Angular bundle)
- Brak `src/main/resources/static/browser/` subdirectory - pliki w root `static/`

#### Manual Verification:

- `java -jar target/clearkyc-*.jar` startuje bez błędów; GET `http://localhost:8080/` zwraca `index.html` (nie 404 ani actuator response)

---

## Phase 3: Dev proxy i Spring SPA routing

### Overview

Konfigurujemy proxy deweloperskie (`ng serve` → Spring `:8080`) oraz `SpaController` w Springu, który przy HTML5 routing zwraca `index.html` zamiast 404 dla nieznanych ścieżek.

### Changes Required:

#### 1. Proxy konfiguracja dla ng serve

**File**: `web/proxy.conf.json` (nowy)

**Intent**: Przekierować wywołania `/api/**` i `/actuator/**` do `http://localhost:8080` podczas `ng serve`, by frontend developerski komunikował się z lokalnym Spring backendem.

**Contract**:
```json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false,
    "pathRewrite": { "^/api": "/api" }
  },
  "/actuator": {
    "target": "http://localhost:8080",
    "secure": false
  }
}
```

#### 2. Podpięcie proxy w angular.json

**File**: `web/angular.json`

**Intent**: Wskazać `proxy.conf.json` jako konfigurację proxy dla `ng serve`.

**Contract**: W sekcji `projects.web.architect.serve.options`: `"proxyConfig": "proxy.conf.json"`.

#### 3. Spring SPA catch-all controller

**File**: `src/main/java/com/example/clearkyc/web/SpaController.java` (nowy)

**Intent**: Przechwycić żądania GET do tras Angular (1- i 2-poziomowe ścieżki bez rozszerzenia pliku) i zwrócić `index.html`. Spring ResourceHttpRequestHandler obsługuje pliki statyczne (`.js`, `.css`, `.ico`) automatycznie - ten kontroler NIE może ich przechwytywać.

**Contract**:
```java
@Controller
public class SpaController {

    @GetMapping({"/{p:[^\\.]*}", "/{p1:[^\\.]*}/{p2:[^\\.]*}"})
    public String spa() {
        return "forward:/index.html";
    }
}
```

Regex `[^\\.]*` wyklucza URLe zawierające `.` (rozszerzenia plików). Dwa mappingi obsługują ścieżki 1-poziomowe (`/cases`) i 2-poziomowe (`/cases/new`, `/cases/:id`). Pakiet: `com.example.clearkyc.web`.

### Success Criteria:

#### Automated Verification:

- `./mvnw test` exits 0 (istniejące testy nie mogą pęknąć przez nowy kontroler)
- `test -f web/proxy.conf.json`

#### Manual Verification:

- Uruchomić Spring (`./mvnw spring-boot:run`) i Angular (`cd web && npm start`) równolegle; GET `http://localhost:4200/actuator/health` przez proxy zwraca JSON `{"status":"UP",...}`
- GET `http://localhost:8080/cases/new` (przez Spring bezpośrednio) zwraca `index.html` (nie 404, nie blank)
- GET `http://localhost:8080/main-HASH.js` zwraca plik JS (statyczny resource handler działa)

---

## Phase 4: Routing, AppLayout i AuthGuard stub

### Overview

Definiujemy trasy aplikacji (`/cases/new`, `/cases/:id`), tworzymy `AppLayoutComponent` z CSS flex split-panel (BEM, placeholder divs), stub `AuthGuard` zwracający `true` (TODO: implementacja w F-01) i placeholder komponenty dla każdej trasy.

### Changes Required:

#### 1. Trasy aplikacji

**File**: `web/src/app/app.routes.ts`

**Intent**: Zdefiniować trasy, które F-03 ujawnia: tworzenie nowego case, widok istniejącego case, catch-all redirect. Trasy chronione stub guardem; guard jest override-owalny przez F-01.

**Contract**: Eksportuje `Routes` z:
- `{ path: 'cases/new', component: NewCaseComponent, canActivate: [authGuard] }`
- `{ path: 'cases/:id', component: CaseDetailComponent, canActivate: [authGuard] }`
- `{ path: '', redirectTo: 'cases/new', pathMatch: 'full' }`
- `{ path: '**', redirectTo: 'cases/new' }`

`AppLayoutComponent` jako wrapper (via `AppComponent` z `<router-outlet>`) lub każda trasa layoutem osobno - implementer decyduje biorąc pod uwagę strukturę `app.component.ts`.

#### 2. Stub AuthGuard

**File**: `web/src/app/core/guards/auth.guard.ts` (nowy)

**Intent**: Functional guard jako placeholder dla przyszłej implementacji auth w F-01. Wszystkie chronione trasy są dostępne - stub nie blokuje żadnego dostępu.

**Contract**:
```typescript
// TODO: implement real auth check in F-01 (auth-scaffold)
export const authGuard: CanActivateFn = () => true;
```

Functional guard (nie klasa), eksportowany jako `authGuard`.

#### 3. AppLayoutComponent - split-panel

**File**: `web/src/app/layout/app-layout/app-layout.component.ts` (nowy)
**File**: `web/src/app/layout/app-layout/app-layout.component.html` (nowy)
**File**: `web/src/app/layout/app-layout/app-layout.component.scss` (nowy)

**Intent**: Komponent layoutu z dwoma panelami obok siebie (CSS flex). Lewy panel (50%): placeholder obszaru PDF viewer (S-01). Prawy panel (50%): placeholder formularza ekstrakcji (S-01). Resizability i interaktywność poza zakresem F-03.

**Contract (HTML)**: Struktura BEM:
```html
<div class="app-layout">
  <div class="app-layout__pane app-layout__pane--pdf">
    <p class="app-layout__placeholder">PDF viewer — dostępny w S-01</p>
  </div>
  <div class="app-layout__pane app-layout__pane--form">
    <p class="app-layout__placeholder">Formularz ekstrakcji — dostępny w S-01</p>
  </div>
</div>
```

**Contract (SCSS)**: Wszystkie wartości liczbowe i kolorystyczne muszą pochodzić z design system tokenów (CSS custom properties z `_variables.scss`) - żadnych hardcoded hex ani px poza spacingiem opartym na `var(--space-*)`. Struktura:
- `.app-layout`: `display: flex; height: 100vh; overflow: hidden; background-color: var(--color-surface-base);`
- `.app-layout__pane`: `overflow: auto; border-color: var(--color-border);`
- `.app-layout__pane--pdf`: `flex: 0 0 50%; border-right: 1px solid var(--color-border);`
- `.app-layout__pane--form`: `flex: 1;`
- `.app-layout__placeholder`: kolor `var(--color-text-secondary)`, font-size `var(--font-size-sm)`, padding `var(--space-4)` lub odpowiedni token

Komponent powyżej 100 linii - osobne pliki (wymuszone przez angular-pitfalls regułę 7).

#### 4. Placeholder komponenty tras

**File**: `web/src/app/features/case-new/case-new.component.ts` (nowy)
**File**: `web/src/app/features/case-detail/case-detail.component.ts` (nowy)

**Intent**: Minimal standalone komponenty renderowane w routerze - placeholder do zastąpienia w S-01.

**Contract**: Każdy to standalone `@Component` z `template: '<app-layout />'` lub `template: '<p>...</p>'` wskazującym na S-01 jako kontynuację. Selector: `app-case-new`, `app-case-detail`.

#### 5. AppComponent - router outlet

**File**: `web/src/app/app.component.ts`

**Intent**: Upewnić się, że `AppComponent` zawiera `<router-outlet>` i importuje `RouterOutlet`. `ng new` generuje standalone `AppComponent` - dostosować template jeśli nie ma `<router-outlet>`.

**Contract**: Template zawiera `<router-outlet />`. `imports: [RouterOutlet]`. Brak zbędnej logiki w `AppComponent` - to czysta shell.

### Success Criteria:

#### Automated Verification:

- `cd web && ng build --configuration production` exits 0 z nowymi komponentami
- `cd web && npx tsc --noEmit` exits 0 (TypeScript bez błędów)

#### Manual Verification:

- Otwórz `http://localhost:4200/cases/new` - renderuje split-panel z dwoma panelami (PDF i form placeholder)
- Otwórz `http://localhost:4200/cases/abc123` - renderuje split-panel (case-detail placeholder)
- Otwórz `http://localhost:4200/` - redirect do `/cases/new` działa
- Odśwież stronę na `/cases/new` przez Spring (`http://localhost:8080/cases/new`) - Spring zwraca `index.html`, Angular router łapie route - split-panel widoczny

---

## Testing Strategy

### Unit Tests:

- Istniejący `ClearkycApplicationTests.contextLoads()` musi przechodzić przez wszystkie fazy - nowy `SpaController` nie może złamać Spring kontekstu

### Manual Testing Steps:

1. Po Phase 2: `./mvnw package -DskipTests && java -jar target/clearkyc-*.jar` - GET `/` zwraca HTML z Angular bootstrap
2. Po Phase 3: uruchomić obie aplikacje; zweryfikować proxy i SPA catch-all jak w Success Criteria
3. Po Phase 4: nawigacja przez trasy i refresh - weryfikacja HTML5 routing end-to-end

## Performance Considerations

- `ng build --configuration production` kompiluje z tree-shaking i minifikacją - bundle size akceptowalny dla MVP
- `frontend-maven-plugin` pobiera Node ~85 MB przy pierwszym `./mvnw package` - potem Node jest cache'owany w `target/node/`; CI/CD nie cache'uje `target/` między runami (to do rozważenia w przyszłości jeśli build time stanie się problemem)

## Migration Notes

Brak migracji danych. Jedyna migracja: Paketo buildpack teraz uruchamia `./mvnw package` który zawiera frontend build step. Przy pierwszym uruchomieniu CI/CD po tym commicie build będzie wolniejszy (~2-4 min dodatkowego czasu na pobranie Node + `npm ci` + `ng build`).

## References

- Roadmap: `context/foundation/roadmap.md` (F-03)
- PRD refs: FR-009 (split-panel), FR-006 (streaming form), FR-004 (file upload)
- Angular pitfalls: `~/.claude/skills/angular-pitfalls/SKILL.md`
- frontend-maven-plugin docs: https://github.com/eirslett/frontend-maven-plugin
- Linear: DOM-7

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Angular SPA scaffold z design systemem

#### Automated

- [x] 1.1 `cd web && ng build` exits 0 — 5d57a3b
- [x] 1.2 `cd web && ng build --configuration production` exits 0 — 5d57a3b
- [x] 1.3 `test -f web/src/styles/design-system/_variables.scss` — plik tokenów istnieje — 5d57a3b

#### Manual

- [x] 1.4 Przejrzeć `_variables.scss` — tokeny kolorów sensowne dla banking dashboard — 5d57a3b
- [x] 1.5 Brak `provideAnimationsAsync` w `app.config.ts` — 5d57a3b
- [x] 1.6 `angular.json` nie zawiera `"zone.js"` w polyfills — 5d57a3b

### Phase 2: Maven Frontend Plugin — integracja buildu

#### Automated

- [x] 2.1 `./mvnw package -DskipTests` exits 0 — d82886f
- [x] 2.2 `test -f src/main/resources/static/index.html` po budowaniu — d82886f
- [x] 2.3 `ls src/main/resources/static/*.js` zwraca przynajmniej jeden plik — d82886f
- [x] 2.4 Brak `src/main/resources/static/browser/` subdirectory — d82886f

#### Manual

- [x] 2.5 `java -jar target/clearkyc-*.jar` — GET `http://localhost:8080/` zwraca `index.html` — d82886f

### Phase 3: Dev proxy i Spring SPA routing

#### Automated

- [x] 3.1 `./mvnw test` exits 0 — istniejące testy nie pękają — 06e9607
- [x] 3.2 `test -f web/proxy.conf.json` — 06e9607

#### Manual

- [x] 3.3 GET `http://localhost:4200/actuator/health` przez proxy zwraca JSON `{"status":"UP",...}` — 06e9607
- [x] 3.4 GET `http://localhost:8080/cases/new` przez Spring zwraca `index.html` (nie 404) — 06e9607
- [x] 3.5 GET `http://localhost:8080/main-*.js` zwraca plik JS (static resource handler działa) — 06e9607

### Phase 4: Routing, AppLayout i AuthGuard stub

#### Automated

- [x] 4.1 `cd web && ng build --configuration production` exits 0 z nowymi komponentami
- [x] 4.2 `cd web && npx tsc --noEmit` exits 0

#### Manual

- [x] 4.3 `http://localhost:4200/cases/new` renderuje split-panel (PDF i form placeholder)
- [x] 4.4 `http://localhost:4200/cases/abc123` renderuje split-panel (case-detail placeholder)
- [x] 4.5 `http://localhost:4200/` redirectuje do `/cases/new`
- [x] 4.6 Refresh na `http://localhost:8080/cases/new` — Spring zwraca `index.html`, Angular router ładuje split-panel
