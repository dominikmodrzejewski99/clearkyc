<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Extraction SSE Codec Layer (K1)

- **Plan**: context/changes/extraction-sse-codec/plan.md
- **Mode**: Deep
- **Date**: 2026-07-07
- **Verdict**: SOUND (after triage fixes)
- **Findings**: 1 critical, 1 warning, 1 observation — all fixed in plan

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | WARNING → resolved |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL → resolved |
| Plan Completeness | WARNING → resolved |

## Grounding

5/5 paths ✓ (extraction-stream.service.ts, extraction.models.ts,
extraction-form.component.ts, extraction-stream.service.spec.ts,
ExtractionEvent.java), 5/5 symbols ✓ (parseSSEMessage, `caseId ?? payload`,
Java `errorCode` field, AnalysisError handler, `markAnalyzed()` signature),
brief↔plan: n/a (no plan-brief.md for this change).

## Findings

### F1 — Guard AnalysisComplete może zablokować markAnalyzed()

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pauza żeby przemyśleć
- **Dimension**: Blind Spots
- **Location**: Phase 1, punkt 2 (`toAnalysisComplete`)
- **Detail**: `AnalysisComplete.caseId` jest nieużywane — `case.store.ts:97`
  `markAnalyzed(): void` nie przyjmuje argumentów, a
  `extraction-form.component.ts:123` woła `markAnalyzed()` ignorując event.
  Oryginalny draft planu proponował zwrot `null` przy braku `caseId` w
  payloadzie — to zablokowałoby emisję terminalnego eventu i zawiesiło flow
  w `isAnalyzing`, czyli gorszą regresję niż dzisiejszy nieszkodliwy fallback.
- **Fix A ⭐ Recommended**: Usuń walidację blokującą emisję eventu — `caseId`
  jest polem martwym, guard zawsze zwraca event (z `caseId: ''` przy braku
  danych + `console.warn`), nigdy `null`.
  - Strength: Zgodne z faktycznym użyciem (grep potwierdza zero konsumentów
    `event.caseId`); zero ryzyka deadlocku `isAnalyzing`.
  - Tradeoff: Jeśli `caseId` miał służyć przyszłej funkcji (dedup równoległych
    streamów), ta ścieżka znika bez dyskusji.
  - Confidence: HIGH — grep w całym `web/src` potwierdza brak konsumentów.
  - Blind spot: Nie sprawdzono planów backendu wobec `caseId`.
- **Fix B**: Zachowaj `caseId` w kontrakcie, przy braku loguj i mimo to zwróć
  event.
- **Decision**: FIXED (Fix A) — plan.md zaktualizowany: guard `toAnalysisComplete`
  nigdy nie zwraca `null`, zawsze emituje event z `caseId: ''` jako fallback.

### F2 — Success Criteria nie testowały scenariusza z F1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja oczywista po rozwiązaniu F1
- **Dimension**: End-State Alignment
- **Location**: Phase 1, Success Criteria + Progress 1.2
- **Detail**: Test "brak caseId → oczekuj null" mógłby przejść zielono mimo
  regresji z F1.
- **Fix**: Test 1.2 zaktualizowany — oczekuje eventu z `caseId: ''`, nie `null`.
- **Decision**: FIXED (razem z F1)

### F3 — Konsument errorCode nieprecyzyjnie opisany

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — kosmetyczne doprecyzowanie
- **Dimension**: Plan Completeness
- **Location**: Phase 1, punkt 4
- **Detail**: "dodaj co najmniej console.error/log z event.errorCode" bez
  dokładnego snippetu.
- **Fix**: Doprecyzowano dokładny kod w planie (`console.error('[extraction]',
  event.errorCode, event.message)` przed `markAnalysisError`).
- **Decision**: FIXED
