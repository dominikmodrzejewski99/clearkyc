---
date: 2026-06-20T15:45:00+02:00
researcher: Dominik Modrzejewski
git_commit: d50219dfa35cc01aadf113d78b73f51f7badd897
branch: main
repository: 10xdevs
topic: "Nieprawidlowe dzialanie scrollowania do miejsca cytatu"
tags: [research, citation, pdf-viewer, scroll, ngx-extended-pdf-viewer, bug]
status: complete
last_updated: 2026-06-20
last_updated_by: Dominik Modrzejewski
---

# Research: Nieprawidlowe dzialanie scrollowania do miejsca cytatu

**Date**: 2026-06-20 15:45 CEST
**Researcher**: Dominik Modrzejewski
**Git Commit**: d50219dfa35cc01aadf113d78b73f51f7badd897
**Branch**: main
**Repository**: 10xdevs (ClearKYC)

## Research Question

Dlaczego scrollowanie do miejsca cytatu w PDF viewer dziala nieprawidlowo i niesatysfakcjonujaco? Co jest przyczyna i jak to naprawic?

## Summary

Znaleziono **jeden krytyczny bug** i **dwa architektoniczne problemy**:

1. **KRYTYCZNY BUG: mismatch nazwy pola** - Java `Citation` eksportuje pole jako `pageNumber`, ale TypeScript `Citation` oczekuje `page`. Brak transformacji w parserze SSE. W efekcie `citation.page` jest `undefined` w calym frontendzie.
2. **Problem architektoniczny 1: brak precyzyjnych koordynat** - system przechowuje tylko numer strony + tekst cytatu. Brak `x, y, width, height` pozwalajacych na scroll do dokladnej pozycji wewnatrz strony.
3. **Problem architektoniczny 2: timing/kolejnosc efektow** - nawigacja do strony (`[page]`) i wyszukiwanie tekstu (`pdfService.find()`) dzialaja niezaleznie; `find()` moze sie wykonac zanim PDF wyrenderuje docelowa strone.

## Detailed Findings

### 1. Krytyczny Bug: `pageNumber` vs `page`

**Lokalizacja backendu:**
`src/main/java/com/example/clearkyc/analysis/Citation.java:3`
```java
public record Citation(String quote, int pageNumber) {}
```

**Lokalizacja DTO REST (inny kontekst):**
`src/main/java/com/example/clearkyc/web/dto/CitationRecord.java:3`
```java
public record CitationRecord(int page, String quote) {}
```

**Co jest streamowane przez SSE:**
`ExtractionEvent.FieldExtracted` uzywa `List<Citation>` (nie `CitationRecord`), wiec Jackson serializuje do:
```json
{"fieldName":"companyName","value":"Acme","citations":[{"quote":"Acme Corp","pageNumber":2}]}
```

**Parser SSE po stronie frontendu:**
`web/src/app/core/services/extraction-stream.service.ts` - funkcja `parseSSEMessage()` robi `JSON.parse(dataLine)` bez zadnej transformacji pol.

**TypeScript interface:**
`web/src/app/core/models/extraction.models.ts:3-6`
```typescript
export interface Citation {
  page: number;   // <-- oczekuje "page", dostaje "pageNumber" - undefined!
  quote: string;
}
```

**Konsekwencje:**
- `citation.page` === `undefined` wszedzie w UI (ExtractionForm, CitationBadge, SnippetPanel)
- `caseStore.activePage.set(undefined)` - ngx-extended-pdf-viewer dostaje `undefined` jako `[page]`
- `caseStore.activeQuote.set({ page: undefined, quote: "..." })` - snippet panel pokazuje "str. undefined"
- `pdfService.find()` dziala (tekst nadal jest), ale nawigacja do strony - nie

### 2. Mechanizm scrollowania - jak powinien dzialac

Pelny przeplywy danych po kliknieciu cytatu:

```
Uzytkownik klika cytat w ExtractionForm/CitationBadge
    |
    v
navigateToCitation(citation) / navigate()
    |
    +-- caseStore.activePage.set(citation.page)   <-- teraz undefined!
    +-- caseStore.activeQuote.set({page, quote})  <-- page undefined!
    |
    v
CaseDetailComponent bindy do PdfViewerComponent:
  [targetPage]="caseStore.activePage()"           <-- undefined do ngx-viewer
  [activeQuote]="caseStore.activeQuote()"
    |
    v
PdfViewerComponent:
  [page]="targetPage()"                           <-- undefined, viewer nie nawiguje
  effect() -> pdfService.find(q.quote, {...})     <-- to dziala, ale scrolluje tylko
                                                      jesli tekst na biezacej stronie
```

Kluczowe pliki:
- `web/src/app/features/case-detail/case-detail.component.html:26-30` - bindingi
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:90-93` - trigger
- `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:34-46` - effect z find()
- `web/src/app/shared/components/citation-badge/citation-badge.component.ts:16-19` - drugi trigger

### 3. Implementacja find() w PDF Viewer

`web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:34-46`
```typescript
effect(() => {
  if (!this.isReady()) return;
  const q = this.activeQuote();
  if (q?.quote) {
    this.pdfService.find(q.quote, {
      highlightAll: true,
      matchDiacritics: true,
      useSecondaryFindcontroller: true,
    });
  } else {
    this.pdfService.find('', { useSecondaryFindcontroller: true });
  }
});
```

**Problem z `useSecondaryFindcontroller: true`**: Wedlug dokumentacji ngx-extended-pdf-viewer secondary find controller nie wykonuje automatycznego scrollowania do znalezionego tekstu (sluzy glownie do podswietlania bez UI). Scroll do cytatu moze w ogole nie dzialac.

**Problem z kolejnoscia**: `[page]="targetPage()"` i `effect()` z `find()` sa niezalezne. Moze sie zdarzyc:
1. `activeQuote` zmienia sie
2. Angular renderuje nowy `[page]` -> viewer zaczyna ladowac strone
3. `effect()` odpala `pdfService.find()` natychmiast
4. `find()` szuka tekstu na stronie ktora jeszcze sie laduje -> nie znajdzie, nie przewinie

### 4. Brak koordynat cytatu

Backend (LLM prompt w ExtractionService.java:37-65) prosil LLM o:
```json
{"quote":"<verbatim text>","pageNumber":<n>}
```

Brak prosb o koordynaty (`x`, `y`, `width`, `height`). To swiadoma decyzja lub przeoczenie - pdfjs-dist i ngx-extended-pdf-viewer wspieraja scroll do konkretnych koordynat przez `scrollPageIntoView()` lub `PDFPageView.scrollIntoView()`, ale wymaga to danych z warstwy tekstowej PDF, nie z LLM.

### 5. Snippet Panel - status

`web/src/app/shared/components/snippet-panel/snippet-panel.component.html` - komponent istnieje.
`web/src/app/features/case-detail/case-detail.component.html` - `<app-snippet-panel />` zostal usunienty z layoutu (git diff to pokazuje).

Komponent pokazywal `str. {{ caseStore.activeQuote()!.page }}` - tez wyswietlalby "str. undefined" przez bug #1.

## Code References

- `src/main/java/com/example/clearkyc/analysis/Citation.java:3` - Pole `pageNumber` (Java camelCase record)
- `src/main/java/com/example/clearkyc/web/dto/CitationRecord.java:3` - DTO REST z `page` (inny kontekst)
- `src/main/java/com/example/clearkyc/analysis/ExtractionEvent.java:8-10` - `FieldExtracted` uzywa `List<Citation>`
- `web/src/app/core/models/extraction.models.ts:3-6` - TypeScript `Citation` oczekuje `page`
- `web/src/app/core/services/extraction-stream.service.ts` - `parseSSEMessage()` bez transformacji
- `web/src/app/core/store/case.store.ts:12-15` - sygnaly `activePage` i `activeQuote`
- `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.ts:90-93` - trigger cytatu
- `web/src/app/shared/components/citation-badge/citation-badge.component.ts:16-19` - drugi trigger
- `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:34-46` - effect z find()
- `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.html:12-23` - `[page]="targetPage()"`

## Architecture Insights

### Co dziala dobrze
- Architektura signal-based (CaseStore) jest czysta i prosta
- Podswietlanie tekstu przez `pdfService.find()` z `highlightAll: true` - dobry pomysl
- `matchDiacritics: true` - odpowiednie dla polskich dokumentow
- `isReady` guard - zabezpiecza przed odpaleniem find() zanim viewer zaladuje PDF

### Gdzie jest problem
- Brak walidacji/transformacji danych na granicy SSE (backend -> frontend)
- Java records eksportuja nazwy pol 1:1 (camelCase), TypeScript interface uzywa innych nazw
- `useSecondaryFindcontroller: true` moze blokowac automatyczny scroll
- Brak synchronizacji miedzy nawigacja stronami a wyszukiwaniem tekstu

## Open Questions

1. **Czy `useSecondaryFindcontroller: true` w ogole scrolluje?** Wymaga weryfikacji w dokumentacji ngx-extended-pdf-viewer v27.
2. **Jak LLM wybiera `pageNumber`?** Prompt mowi "best-effort, default 0 if unknown" - czy LLM podaje poprawne numery stron?
3. **Czy `CitationRecord.java` jest uzywany w streamingu?** Jesli gdzies jest mapowanie `Citation -> CitationRecord` przed serializacja, bug nie wystepuje. Wymaga sprawdzenia.
4. **Co z `pdfjs-dist` TextLayer API?** Poprzednie research (obs 3952-3953) wskazuje na mozliwosc precyzyjnego scroll-to-text przez `TextLayer`. Czy warto to rozbudowac?

## Recommended Fix Priority

1. **Natychmiast (krytyczny)**: Napraw mismatch `pageNumber` -> `page` - albo przez zmiane nazwy pola w `Citation.java` na `page`, albo przez transformacje w `parseSSEMessage()`, albo przez `@JsonProperty("page")` w Javie.
2. **Krotkoterminowo**: Zbadaj czy `useSecondaryFindcontroller: true` powoduje brak scrollu - jesli tak, usun tę opcje lub uzyj primary find controller z ukrytym UI.
3. **Sredniookresowo**: Dodaj synchronizacje efektow - najpierw nawiguj do strony, poczekaj na render, potem uruchom find().
4. **Opcjonalnie**: Rozważ precyzyjny scroll przez pdfjs-dist TextLayer jezeli wyszukiwanie tekstowe zawodzi dla dlugich/skomplikowanych cytatow.
