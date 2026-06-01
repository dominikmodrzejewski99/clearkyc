<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 Core Case Flow

- **Plan**: context/changes/core-case-flow/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  5 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — POST /api/cases akceptuje dowolny plik bez walidacji MIME

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/main/java/com/example/clearkyc/web/CaseController.java:30
- **Detail**: Serwer nie sprawdza content-type=application/pdf ani rozmiaru. Walidacja frontendowa (FileDropzone) jest bypassowalna przez bezpośrednie curl z JWT.
- **Fix**: Dodać walidację MIME w CaseController lub CaseService: if (!file.getContentType().equals("application/pdf")) throw 422.
- **Decision**: PENDING

### F2 — CaseService.getCase() brak @Transactional(readOnly=true)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/main/java/com/example/clearkyc/service/CaseService.java:28
- **Detail**: Dwa zapytania (findById + findByKybCase) w oddzielnych sesjach JPA. Przy równoległym finalize() możliwe okno gdzie status=LOCKED ale audit=null w odpowiedzi.
- **Fix**: @Transactional(readOnly = true) na metodzie getCase().
- **Decision**: PENDING

### F3 — PdfViewerComponent nie implementuje OnDestroy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:8
- **Detail**: Brak ngOnDestroy — currentRenderTask nie anulowany, pdfDocument.destroy() nigdy nie wywoływany. Wyciek pamięci (ArrayBuffer + worker reference).
- **Fix**: Implementować OnDestroy: this.currentRenderTask?.cancel(); this.pdfDocument()?.destroy();
- **Decision**: PENDING

### F4 — CaseStore nie jest resetowany między nawigacjami

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: web/src/app/core/store/case.store.ts
- **Detail**: Singleton store z reset() który nigdzie nie jest wywoływany. Stale pola między sprawami gdy analityk otwiera inny case.
- **Fix A ⭐ Recommended**: Wywołać caseStore.reset() na początku CaseNewComponent.onFileSelected() i CaseDetailComponent.ngOnInit().
  - Strength: Minimalna zmiana w 2 miejscach; reset() już istnieje.
  - Tradeoff: Żaden.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Zmienić scope store na component-level.
  - Strength: Automatyczne czyszczenie.
  - Tradeoff: Większa zmiana, ryzyko regresji w komponentach dzieci.
  - Confidence: LOW
  - Blind spot: Nie sprawdzono czy CitationBadge/ExtractionForm korzystają ze store bezpośrednio.
- **Decision**: PENDING

### F5 — FinalizeService: redundantny kybCaseRepository.save()

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/main/java/com/example/clearkyc/service/FinalizeService.java:100
- **Detail**: Wewnątrz @Transactional JPA dirty-checking sflusuje mutację automatycznie. Jawny save() jest nadmiarowy i może zmylić przy przyszłym refaktorze (REQUIRES_NEW = partial commit).
- **Fix**: Usunąć kybCaseRepository.save(kybCase); dodać komentarz o intencji single-transaction.
- **Decision**: PENDING

### F6 — DecisionBarComponent: subskrypcja HTTP bez unsubscribe

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: web/src/app/shared/components/decision-bar/decision-bar.component.ts:33
- **Detail**: subscribe() nie jest przechowywany. Jeśli komponent zniszczony podczas HTTP call, callback nadal wywoła markLocked() na zniszczonym komponencie.
- **Fix**: Dodać takeUntilDestroyed() do pipe() lub OnDestroy z unsubscribe().
- **Decision**: PENDING

### F7 — Auth0 credentials hardcoded w app.config.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: web/src/app/app.config.ts:20-21
- **Detail**: domain, clientId i audience są hardcoded. Zmiana tenanta wymaga zmiany kodu, nie zmiennej środowiskowej. Blokuje multi-env deploy.
- **Fix**: Przenieść do src/environments/environment.ts i environment.prod.ts.
- **Decision**: PENDING

### F8 — PdfViewerComponent brak standalone: true

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:3
- **Detail**: Wszystkie inne nowe komponenty mają standalone: true. PdfViewer nie ma — niezgodność z wzorcem projektu (zoneless + standalone).
- **Fix**: Dodać standalone: true do @Component.
- **Decision**: PENDING
