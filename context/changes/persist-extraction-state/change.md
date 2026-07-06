---
change_id: persist-extraction-state
title: Persist extraction results so case detail survives a page refresh
status: implementing
created: 2026-07-05
updated: 2026-07-06
archived_at: null
---

## Notes

Reported symptom: odświeżenie `/cases/:id` gubi cały wynik analizy
(company name, directors, UBO, red flagi) — strona wygląda jakby analiza
nigdy się nie odbyła, mimo że przed odświeżeniem była widoczna.

Root cause (potwierdzony researchem, patrz konwersacja z 2026-07-05):
backend nigdy trwale nie zapisuje wyekstrahowanych danych dla stanów
ANALYZING/ANALYZED. Wynik ekstrakcji żyje wyłącznie:
- efemerycznie w pamięci serwera podczas trwania pojedynczego SSE streamu
  (`ExtractionService.java` — `AtomicReference<StringBuilder> buf` linia ~108,
  `AtomicReference<List<RedFlagItem>> accumulatedFlags` linia ~109),
- w pamięci przeglądarki jako Angular signals w `CaseStore`
  (`web/src/app/core/store/case.store.ts`) — zerują się przy pełnym reload.

`CaseDetailResponse` (`src/main/java/com/example/clearkyc/web/dto/CaseDetailResponse.java:7-13`)
zwraca tylko `id, status, createdAt, updatedAt, lockedAt, audit, entityName` —
brak pola na wyekstrahowane dane. `KybCase` encja i migracje Flyway (V1-V4)
nie mają kolumny/tabeli do tego. Jedyny trwały zapis strukturalnych danych to
`AuditRecord.payload` przy `LOCKED`, i to zapisywany z danych przesłanych
z powrotem przez front (`FinalizeService.java:70-98`), nie z serwerowego cache'u.

To jest luka architektoniczna backendu, nie tylko brakujący krok rehydracji
na froncie — nawet front-endowy GET przy `ngOnInit` nie miałby skąd czerpać
danych bez zmian po stronie serwera (nowa kolumna/tabela + zapis w
`ExtractionService.doFinally`, rozszerzenie `CaseDetailResponse` +
`CaseService.getCase`, dopiero potem rehydracja `case-detail.component.ts`).

Otwarte pytanie do rozstrzygnięcia w /ai-frame lub na starcie /ai-plan:
czy trzeba trwale persistować pełny wynik ekstrakcji, czy wystarczy inne
podejście (np. automatyczny re-run analizy po wykryciu utraty stanu).

## Update 2026-07-06

`/ai-frame` (`frame.md`) rozdzielił to na dwa różne problemy:
1. **LOCKED reload = potwierdzony bug** — dane już są w `AuditRecord.payload`,
   brakuje tylko zwrócenia ich do frontendu. Zaplanowane w `plan.md` (ten
   change), gotowe do `/ai-implement`.
2. **Pre-decision (ANALYZING/ANALYZED) reload = otwarta decyzja produktowa**,
   nie bug — do ustalenia osobno po zamknięciu (1).
