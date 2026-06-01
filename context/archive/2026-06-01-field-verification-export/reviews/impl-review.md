<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 Field Verification & Export

- **Plan**: context/changes/field-verification-export/plan.md
- **Scope**: All phases (P1–P4)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION (all issues addressed)
- **Findings**: 2 critical  4 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | FAIL (fixed) |
| Architecture | PASS |
| Pattern Consistency | WARNING (fixed) |
| Success Criteria | PASS |

## Findings

### F1 — PDFDocumentProxy wyciek pamięci po przerwaniu ładowania

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: pdf-viewer.component.ts:79-81
- **Detail**: Gdy loadPdf jest wywoływana ponownie a poprzedni loadingTask.promise kończy się PO inkrementacji renderGeneration, kod trafia na guard `if (generation !== this.renderGeneration) return` bez wywołania `doc.destroy()` — PDFDocumentProxy wycieka na czas życia taba.
- **Fix**: Dodaj `(doc as any).destroy()` przed early return.
- **Decision**: FIXED — f75ce04

### F2 — Niezłapany rejection przy doc.getPage() na zniszczonym dokumencie

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: pdf-viewer.component.ts:111
- **Detail**: ngOnDestroy wywołuje pdfDocument()?.destroy() synchronicznie gdy renderAllPages wciąż czeka na `await doc.getPage(i)`. Po destroy pdfjs rzuca błąd (nie RenderingCancelledException) — unhandled promise rejection w konsoli.
- **Fix**: Wrap doc.getPage(i) w try/catch wewnątrz pętli.
- **Decision**: FIXED — f75ce04

### F3 — isAnalyzing może utksnąć po powrocie do tej samej sprawy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: case-detail.component.ts:23-27
- **Detail**: Gdy skip-reset (IDs się zgadzają), isAnalyzing może pozostać true z poprzedniej sesji — ExtractionForm pokazuje "Analizowanie..." bez aktywnego streamu.
- **Fix**: `} else { this.caseStore.isAnalyzing.set(false); }`
- **Decision**: FIXED — f75ce04

### F4 — extraction-form używa ręcznej Subscription zamiast takeUntilDestroyed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: extraction-form.component.ts:2 + 17
- **Detail**: streamSub: Subscription | null z manualnym ngOnDestroy — jedyne miejsce w featurze z tym wzorcem. Reszta używa inject(DestroyRef) + takeUntilDestroyed.
- **Fix**: Refaktor do inject(DestroyRef) + Subject cancelStream$ + takeUntil + takeUntilDestroyed.
- **Decision**: FIXED — f75ce04

### F5 — FinalizeService: null z jwt.getSubject() daje mylący błąd 422

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: DecisionController.java:27
- **Detail**: jwt.getSubject() zwraca null gdy JWT nie ma claima sub. Schemat łapie to z 422 zamiast 500, co sugeruje błąd klienta a nie konfiguracji IdP.
- **Fix**: Guard w DecisionController z ResponseStatusException INTERNAL_SERVER_ERROR.
- **Decision**: FIXED — f75ce04

### F6 — pdf-viewer używa OnDestroy zamiast DestroyRef (brak komentarza)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: pdf-viewer.component.ts:16
- **Detail**: OnDestroy jest uzasadniony (pdfjs wymaga explicit destroy()), ale brak komentarza wyjaśniającego odejście od wzorca.
- **Fix**: Dodaj komentarz do ngOnDestroy.
- **Decision**: FIXED — f75ce04

### F7 — GlobalWorkerOptions.workerSrc ustawiany przy każdym loadPdf

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: pdf-viewer.component.ts:72
- **Detail**: Process-global side effect w per-invocation metodzie. Idempotentne teraz, ale kruche przy dwóch instancjach viewera.
- **Fix**: Moduł-level flag `pdfjsWorkerInitialized`.
- **Decision**: FIXED — f75ce04

### F8 — DecisionControllerTest nie pokrywa field.override=null ani z override

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: DecisionControllerTest.java:43
- **Detail**: VALID_JSON nie testuje nullable override ani populated FieldOverride.
- **Fix**: Dodano dwa testy: `fieldWithNullOverride_returns200` i `fieldWithPopulatedOverride_returns200`.
- **Decision**: FIXED — f75ce04

### F9 — Dwa identyczne ✏ ikony w extraction-form (UX/a11y)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: extraction-form.component.html:82-90
- **Detail**: Override badge i edit button używają tego samego ✏ znaku — screen reader nie odróżni akcji.
- **Fix**: Dodano aria-label do obu przycisków.
- **Decision**: FIXED — f75ce04

### F10 — ObjectMapper w FinalizeService bez TODO prefixu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Maintainability
- **Location**: FinalizeService.java:~38
- **Detail**: Bare ObjectMapper odchodzi od Spring bean. Komentarz bez TODO prefixu — nie jest searchable.
- **Fix**: Prefix `// TODO(json-schema-validator-jackson3):`.
- **Decision**: FIXED — f75ce04
