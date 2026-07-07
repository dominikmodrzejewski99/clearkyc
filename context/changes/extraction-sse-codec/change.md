---
change_id: extraction-sse-codec
title: Codec layer dla parseSSEMessage (K1)
status: implementing
created: 2026-07-07
updated: 2026-07-07
archived_at: null
---

## Notes

Kandydat K1 z `context/changes/refactor-opportunities/research.md`. Prererekwizyt K5
(exhaustiveness check w `parseSSEMessage()`) jest już zaimplementowany — patrz
`context/changes/refactor-opportunities/plan.md` Phase 1.

Cel: wydzielić `parseSSEMessage()` z `extraction-stream.service.ts` do dedykowanego
`extraction.codec.ts`, dodać type guards per wariant SSE, i zamknąć dwie znane luki:

1. `AnalysisError` traci pole `errorCode` przy parsowaniu (TS ma tylko `message`,
   Java `ExtractionEvent.AnalysisError` ma `errorCode` + `message`).
2. `AnalysisComplete`: `payload.caseId ?? payload` — brak `caseId` w payloadzie
   podstawia cały obiekt jako string bez błędu kompilacji ani testu.

Plan zapisany bezpośrednio (bez osobnego przebiegu `/ai-research` — kontekst już
zebrany w rozmowie i w `refactor-opportunities/research.md` §K1).
