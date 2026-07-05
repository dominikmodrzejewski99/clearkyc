<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Przykładowe dokumenty demo (sample KYB tiles)

- **Plan**: context/changes/przykladowe/plan.md
- **Scope**: Phase 2 of 3
- **Date**: 2026-07-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

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

### F1 — Race condition przy równoległym kliknięciu kilku kafelków

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: web/src/app/features/case-new/case-new.component.ts:34-35, 73-93
- **Detail**: loadingSampleId/sampleErrorId to pojedyncze sygnały globalne dla całej listy. Kliknięcie kafelka B, gdy kafelek A wciąż się ładuje, uruchamia równoległy fetch; oba finalnie wołają onFileSelected(file), wygrywa ten co skończy jako ostatni, bez informacji dla użytkownika.
- **Fix**: Zablokować wszystkie kafelki (nie tylko klikany), gdy loadingSampleId() !== null — spójne z tym, jak submit-btn blokuje się globalnie w trakcie isUploading.
- **Decision**: FIXED

### F2 — Brak weryfikacji content-type pobranego pliku przykładowego

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: web/src/app/features/case-new/case-new.component.ts:78-84
- **Detail**: response.ok jest sprawdzane, ale nie ma weryfikacji Content-Type. SPA fallback routing zwracający 200 OK z index.html dla błędnej ścieżki przejdzie niezauważony aż do backendu.
- **Fix**: Sprawdzić response.headers.get('content-type')?.includes('pdf') przed onFileSelected.
- **Decision**: FIXED

### F3 — Mieszanie stylu Promise (fetch) i RxJS (Observable) w jednym pliku

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: web/src/app/features/case-new/case-new.component.ts (cały plik)
- **Detail**: createCase()/listCases() używają RxJS, loadSampleDocument używa natywnego fetch() z Promise. fetch() nie jest anulowany przy zniszczeniu komponentu.
- **Fix A ⭐ Recommended**: Zostaw jak jest, udokumentuj jako świadomy wyjątek — fetch() pobiera statyczny asset spoza CaseService/HttpClient boundary, side-effect przy race unmount jest nieszkodliwy (tylko local signals).
  - Strength: Zero dodatkowego kodu, naturalny wybór dla tego jednego przypadku.
  - Tradeoff: Dwa idiomy asynchroniczności w jednym pliku.
  - Confidence: HIGH
  - Blind spot: Brak testu na "nawigacja w trakcie ładowania przykładu".
- **Fix B**: Przenieść na HttpClient.get(doc.path, {responseType:'blob'}) + takeUntilDestroyed(this.destroyRef).
  - Strength: Jeden idiom asynchroniczności w całym komponencie.
  - Tradeoff: Więcej kodu dla przypadku bez realnego side-effectu do anulowania.
  - Confidence: MEDIUM
  - Blind spot: Nie sprawdzono globalnych interceptorów HttpClient.
- **Decision**: ACCEPTED (Fix A — zostawiono jak jest, świadomy wyjątek udokumentowany w tym raporcie)

### F4 — Brak aria-live na stanie ładowania/błędu kafelka

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: web/src/app/features/case-new/case-new.component.html:45-50
- **Detail**: .sd-loading/.sd-error to zwykłe div bez aria-live, mimo że isUploading w tym samym pliku poprawnie używa role="status" aria-live="polite" aria-atomic="true".
- **Fix**: Dodać aria-live="polite" do .sd-loading/.sd-error dla spójności.
- **Decision**: FIXED
