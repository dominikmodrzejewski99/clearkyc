# S-02: Field Verification & Export — Plan Brief

> Full plan: `context/changes/field-verification-export/plan.md`
> Research: none (S-01 codebase used as baseline)

## What & Why

S-02 domyka pętlę weryfikacji analityka KYB — dodaje trzy powiązane zdolności na fundamencie S-01: ręczne nadpisanie pola z obowiązkowym uzasadnieniem (FR-010), klikalne cytowania z best-effort text highlight w PDF viewerze (FR-014) oraz ewolucję payloadu audytowego do JSON Schema v0.2, który zawiera cytowania i override justifications per pole (FR-012/FR-013). Bez S-02 analityk nie może korygować błędów modelu ani mieć pewności, że rekord audytu zawiera pełne uzasadnienie decyzji.

## Starting Point

Po S-01: pola są read-only, `DecisionBar` wysyła `overrideJustifications: {}` (zawsze puste), cytowania nawigują do strony ale bez text highlight ani snippet panel. Typ `Override` istnieje w `extraction.models.ts` ale nikt go nie używa. `FinalizeRequest` ma flat `extractedData: Map<String,Object>` bez cytowań — niezgodne z FR-013.

## Desired End State

Analityk w stanie ANALYZED klika ikonę ołówka przy polu, wpisuje korektę i uzasadnienie, widzi override badge. Kliknięcie cytowania [1] nawiguje do strony + podświetla fragment w PDF (lub pokazuje snippet panel gdy highlight niemożliwy). Po finalizacji rekord audytu zawiera pełną tablicę `fields` z cytowaniami i override justifications per pole, zwalidowaną przez v0.2 schema.

## Key Decisions Made

| Decision | Choice | Why | Source |
|---|---|---|---|
| Edit UX | Inline row expansion | Zero context-switch; analityk widzi sąsiednie pola. | Plan |
| Override state po reload | In-memory only | PRD wyklucza per-edit logging w v1 | Plan |
| Re-analyze z overrides | Tak, z warning dialogiem | Blokowanie re-analizy uniemożliwia korektę złej analizy | Plan |
| Payload v0.2 structure | `fields: [{fieldName, value, citations, override?}]` | FR-013 wymaga citations + overrides razem per pole | Plan |
| Override shape | Rich `{originalValue, newValue, justification}` | Audytor widzi co model myślał vs co analityk zdecydował | Plan |
| Schema versioning | Nowy plik `finalization-v0.2.json`, v0.1 zostaje | Immutable schema history; backward compat dla istniejących rekordów | Plan |
| Text highlight | pdfjs text layer + CSS overlay, fallback snippet panel | FR-014 wymaga best-effort próby; page navigation jest primary | Plan |
| Snippet panel position | Overlay na dole PDF pane | Blisko dokumentu; nie burzy layoutu prawego pane | Plan |

## Scope

**In scope:**
- Inline field edit z obowiązkowym uzasadnieniem (FR-010) dla wszystkich extraction fields w stanie ANALYZED
- Edycja pola "Not Disclosed / Inferred Missing" (nadpisanie markera)
- Override indicator + expandable locked view z oryginałem LLM i uzasadnieniem
- Re-analyze warning gdy są aktywne overrides
- Click-to-cite → nawigacja + best-effort text highlight + snippet panel fallback (FR-014)
- JSON Schema v0.2 z per-pole structurą (FR-012/FR-013)
- FinalizeRequest breaking change: `fields: List<FieldRecord>` zamiast flat maps

**Out of scope:**
- Taxonomy-bound dropdowns (S-03 blocked by Open Question 1)
- Per-edit audit logging
- Persystencja overrides przed finalizacją
- Migracja istniejących v0.1 rekordów audytu
- Red flag fields click-to-cite (S-03)

## Architecture / Approach

Cztery izolowane fazy w zależności backend-first → Angular data → Angular UI → Angular PDF. Breaking change w `FinalizeRequest` musi lądować w P1 (backend) i P2 (Angular) razem zanim aplikacja jest uruchamiana ręcznie. Nowe componenty: `SnippetPanelComponent` (standalone, overlay). Rozszerzone: `CaseStore` (+2 signals), `ExtractionFormComponent` (+edit state signals), `PdfViewerComponent` (+activeQuote input + text layer).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Backend schema v0.2 | Nowe DTOs + `finalization-v0.2.json` + FinalizeService update + testy | Breaking change FinalizeRequest — testy muszą być zaktualizowane w tej samej fazie |
| 2. Angular models + store | FieldOverride/FieldRecord types + CaseStore override signals + DecisionBar fields array | FinalizePayload zmiana — ng build musi przejść przed ręcznym testem |
| 3. Inline edit UI | ExtractionForm z edit button, inline form, override badge, re-analyze warning | FormsModule/NgModel — sprawdzić czy standalone import jest potrzebny |
| 4. Snippet panel + text highlight | SnippetPanelComponent + PdfViewer text layer overlay | pdfjs 6.x TextItem coordinate mapping — needs real PDF testing |

**Prerequisites:** S-01 zaimplementowane i zreviewed (✅). Backend running z `GOOGLE_GENAI_API_KEY`.

**Estimated effort:** ~3-4 sesje (4 fazy, P4 jest technicznie najtrudniejsza).

## Open Risks & Assumptions

- **pdfjs text layer v6.x API** — `page.getTextContent()` zwraca `TextItem[]` z `transform` matrix; `viewport.convertToViewportPoint()` istnieje w v6.0.227 (niezweryfikowane na realnym dokumencie — kluczowy test w P4)
- **Scanned documents / OCR** — text layer może nie zwracać pozycji dla skanów; fallback do snippet panel jest primary UX w tym przypadku
- **FormsModule dla NgModel** — `ExtractionFormComponent` jest standalone; import `FormsModule` potrzebny dla `[(ngModel)]` na edit inputs (alternatywa: signals + event binding)

## Success Criteria (Summary)

- Analityk może nadpisać pole z uzasadnieniem i zobaczyć override w locked state
- Kliknięcie cytowania nawiguje do strony + pojawia się snippet panel z verbatim quote
- `SELECT payload::jsonb->'fields' FROM audit_record` po Approve zwraca array z citations i overrides per pole
