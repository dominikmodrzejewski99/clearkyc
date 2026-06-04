# Workstation Case-Detail Fidelity — Plan Brief

> Full plan: `context/changes/workstation-detail-fidelity/plan.md`

## What & Why

S-05 domyka widok `case-detail` do wierności projektu workstation (design reference: `context/foundation/design-system/ck-app.jsx`). S-04 doprowadził upload screen do docelowego wyglądu — S-05 robi to samo dla ekranu analitycznego. Cztery elementy: topbar z kontekstem sprawy, nagłówek panelu PDF, animowany wskaźnik stanu analizy i dwuetapowy commit decyzji zabezpieczający przed przypadkowym zatwierdzeniem.

## Starting Point

Case-detail renderuje `<app-layout>` (split panel PDF/form) bez żadnego topbara. `DecisionBarComponent` to jednoetapowy submit — klik Approve/Reject/Escalate natychmiast wywołuje API. `PdfViewerComponent` nie ma nagłówka pane-head. Backend `CaseDetailResponse` nie zwraca nazwy encji.

## Desired End State

Analityk widzi topbar z logo CK, nazwą encji (z nazwy pliku PDF), ID sprawy i pulsującym badge'em stanu analizy. Panel PDF ma nagłówek "Source document · N pp". W DecisionBar klik Approve/Reject/Escalate zaznacza przycisk solid-fill, a dopiero klik "Commit decision" wysyła decyzję — z amber-warningiem gdy jakiekolwiek pola mają wartość "Not Disclosed / Inferred Missing".

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Źródło entityName | Rozszerz CaseDetail API | Poprawne E2E — działa po refresh bez front-only hacku | Plan |
| entity_name w DB | V2 Flyway migration (nullable) | Additive, nie wymaga backfill starych rekordów | Plan |
| Zasięg topbara | WorkstationTopbarComponent (nowy shared) | Reusable; case-new ma różną zawartość topbara | Plan |
| Warning "unresolved fields" | Missing fields jako proxy, bez blokowania Approve | Zero zmian backendu, `ExtractionField` nie ma flagi `required` | Plan |
| app-layout height | `100vh` → `100%` | Umożliwia umieszczenie topbara ponad layoutem bez overflow | Plan |

## Scope

**In scope:**
- Flyway V2: kolumna `entity_name TEXT NULLABLE` w `kyb_case`
- `KybCase`, `CaseService`, `CaseController`, `CaseDetailResponse` — entityName chain
- `WorkstationTopbarComponent` (nowy): logo, entityName/caseId, run-state badge z animacją pulse
- `CaseStore.entityName` signal + `CaseDetailComponent` wiring
- `PdfViewerComponent`: publiczny `pageCount` signal + pane-head "Source document / N pp"
- `DecisionBarComponent`: `pendingDecision` signal, active-fill styles, "Commit decision" button, amber warning
- `DecisionBarComponent.spec.ts`: aktualizacja testów isSubmitting + nowe testy commit flow + warning

**Out of scope:**
- Awatar analityka w topbarze (brak danych w store)
- Chip cytowania w nagłówku PDF
- Refaktor topbara case-new na WorkstationTopbarComponent
- Endpoint `GET /api/cases` (lista) — tylko single-case detail dostaje entityName
- Faktyczne blokowanie Approve (tylko warning, nie hardgate)

## Architecture / Approach

Backend: additive V2 migration + entityName przekazywany z nazwy pliku przy `POST /api/cases`. Angular: nowy standalone `WorkstationTopbarComponent` z trzema `input()` signals (entityName, caseId, runState). `runState` to computed w `CaseDetailComponent` (isAnalyzing → running, ANALYZED/LOCKED → complete, else → idle). PDF header w template `PdfViewerComponent` — komponent zna swój `pageCount`. DecisionBar: local `pendingDecision` signal oddziela wybór od submit — "Commit decision" button zawsze obecny w ANALYZED, disabled do momentu wyboru.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend entityName | `GET /api/cases/{id}` zwraca entityName z nazwy pliku | Flyway V2 musi zaaplikować przed restartem — lokalna DB może wymagać `./mvnw flyway:repair` |
| 2. WorkstationTopbar | Topbar nad split-layoutem, entityName z CaseStore, run-state badge | Zmiana `app-layout: 100vh → 100%` może złamać obecny viewport fit jeśli brak height-context w routerze |
| 3. PDF pane header | "Source document · N pp" nad panelem PDF | pageCount = 0 przed załadowaniem PDF — ukryć licznik do ready |
| 4. Decision bar commit | Two-step commit + amber warning + zaktualizowane testy | Istniejące testy `isSubmitting` zakładają disabled selection buttons — wymagają zmiany semantyki |

**Prerequisites:** `./mvnw spring-boot:run` działający lokalnie; backend devmode (DevSecurityConfig) lub JWT skonfigurowany

**Estimated effort:** ~1-2 sesje, 4 fazy sekwencyjnie

## Open Risks & Assumptions

- `height: 100%` w app-layout zadziała pod warunkiem, że `case-detail-wrap` z `height: 100dvh` jest wystarczającym kontekstem dla routera Angular — do weryfikacji manualnej po fazie 2.
- Backend devmode (`application-dev.properties`) musi być aktywny do testów manualnych lub trzeba skonfigurować `AUTH0_ISSUER_URI`.

## Success Criteria (Summary)

- Topbar wyświetla entityName (lub caseId) + animowany run-state badge w każdym ze stanów
- Klik decyzji → solid fill; klik "Commit decision" → finalize API; całość bez regresji 60+ testów
- Panel PDF ma nagłówek "Source document" z liczbą stron po załadowaniu dokumentu
