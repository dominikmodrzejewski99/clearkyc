---
change_id: sse-explicit-event-type
title: CI test gate + explicit SSE wire-type contract (K4)
status: implementing
created: 2026-07-07
updated: 2026-07-07
archived_at: null
---

## Notes

Kandydat K4 z `context/changes/refactor-opportunities/research.md`. Odrzucony
w `refactor-opportunities/plan.md` ("What We're NOT Doing") jako zbyt ryzykowny
bez CI test gate: `.github/workflows/fly-deploy.yml` dziś zawiera wyłącznie
`flyctl deploy --local-only`, bez żadnego kroku testowego. Backend
(`ExtractionService.java:189`) używa `event.getClass().getSimpleName()` jako
dyskryminatora typu zdarzenia SSE — nazwa klasy Java = wire name protokołu.
Frontend (`extraction.codec.ts`) hardcoduje te same 4 stringi bez wspólnej
stałej z backendem. Rename klasy złamałby kontrakt frontend/backend bez
błędu kompilacji — i dziś przeszedłby do produkcji niezauważony, bo CI nie
uruchamia testów przed deployem.

Plan ma dwie części w kolejności zależnej:

1. **Prererekwizyt CI**: dodać krok testowy (`./mvnw test` + `npm test`) do
   `fly-deploy.yml`, blokujący deploy przy czerwonych testach.
2. **K4 właściwe**: przypiąć test na obecne wire names (`FieldExtracted` itd.)
   jako literały (nie przez `getClass().getSimpleName()`), potem zastąpić
   `.getClass().getSimpleName()` jawnym, wyczerpującym mappingiem
   (`switch` po sealed interface `ExtractionEvent`, mirror wzorca K5 z
   `extraction.codec.ts` po stronie frontendu).

Plan zapisany bezpośrednio (kontekst zebrany w rozmowie i w
`refactor-opportunities/research.md` §K4, zweryfikowany względem aktualnego
stanu repo: `lefthook.yml`, `fly-deploy.yml`, `ExtractionControllerTest.java`,
`src/test/resources/application.properties` — testy backendowe używają H2,
bez zależności od żywego Postgresa, więc krok CI nie wymaga dodatkowych usług).
