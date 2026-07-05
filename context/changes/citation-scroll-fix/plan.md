# Citation Scroll Fix — Implementation Plan

## Overview

Naprawa dwóch problemów z nawigacją do cytatu: krytyczny bug powodujący że `citation.page` jest `undefined` w całym frontendzie, oraz usunięcie martwego komponentu SnippetPanel który nie pasuje do designu.

## Current State Analysis

Mechanizm nawigacji do cytatu:
1. Kliknięcie cytatu w ExtractionForm/CitationBadge ustawia `caseStore.activePage` i `caseStore.activeQuote`
2. PdfViewerComponent odbiera je przez `[targetPage]` i `[activeQuote]` bindingi
3. `[page]="targetPage()"` nawiguje do strony
4. `effect()` wywołuje `pdfService.find(quote, {useSecondaryFindcontroller: true})` podświetlając tekst

Główny bug: Java `Citation.java` definiuje pole jako `pageNumber`, ale TypeScript `Citation` oczekuje `page`. Jackson serializuje bezpośrednio do JSON jako `"pageNumber"`, parser SSE nie robi transformacji. Wynik: `citation.page === undefined` w całym frontendzie, `[page]="undefined"` trafia do ngx-extended-pdf-viewer, viewer nie nawiguje.

Secondary find controller jest poprawnym rozwiązaniem: podświetla tekst bez pokazywania findbar UI.

### Key Discoveries

- `src/main/java/com/example/clearkyc/analysis/Citation.java:3` - pole `pageNumber`, brak w testach (żaden test nie referencjonuje tego pola)
- `src/main/java/com/example/clearkyc/analysis/ExtractionService.java:42,55,58` - system prompt zawiera `"pageNumber"` w 3 miejscach — musi się zmienić razem z rekordem
- `web/src/app/core/models/extraction.models.ts:4` - TypeScript oczekuje `page: number`
- `web/src/app/shared/components/snippet-panel/` - 3 pliki, zero zewnętrznych importów, szablon case-detail już go nie renderuje

## Desired End State

Po kliknięciu cytatu w ExtractionForm: PDF viewer przewija do właściwej strony dokumentu i podświetla fragment tekstu. Pole "str. X" obok cytatu wyświetla poprawny numer strony. Komponent SnippetPanel nie istnieje w codebase.

**Weryfikacja**: kliknięcie cytatu na stronie 3 → PDF skacze do strony 3, tekst cytatu jest podświetlony.

## What We're NOT Doing

- Zmiana mechanizmu find() — secondary controller jest poprawny, zostaje
- Dodawanie koordynat x/y do cytatu — to osobna, opcjonalna funkcja (scroll w obrębie strony)
- Zmiana architektury CaseStore ani sygnałów
- Jakiekolwiek CSS do chowania UI biblioteki

## Implementation Approach

Dwie niezależne zmiany: (1) naprawa field name na granicy Java→JSON→TypeScript, (2) usunięcie martwego kodu. Phase 1 jest krytyczna i odblokowuje poprawne działanie. Phase 2 to porządkowanie.

## Critical Implementation Details

**Spójność systemu prompt i nazwy pola**: Jackson deserializuje JSON od LLM (`"page":<n>`) do Java rekordu `Citation` i serializuje ten sam rekord do SSE. Zmiana nazwy pola Java wymaga jednoczesnej zmiany nazwy klucza w systemie prompt — inaczej LLM będzie emitował `"pageNumber"` a Jackson szukał `"page"` i deserializował `0` (default int).

---

## Phase 1: Naprawa field name — `pageNumber` → `page`

### Overview

Zmiana nazwy pola w Java rekordzie `Citation` z `pageNumber` na `page` oraz aktualizacja systemu prompt w `ExtractionService`. Po tej fazie `citation.page` w TypeScript dostaje poprawny numer strony ze streamu SSE.

### Changes Required

#### 1. Citation.java — zmiana nazwy pola

**File**: `src/main/java/com/example/clearkyc/analysis/Citation.java`

**Intent**: Przemianuj parametr rekordu z `pageNumber` na `page` żeby Jackson serializował do `"page"` w SSE.

**Contract**: `public record Citation(String quote, int page) {}`

#### 2. ExtractionService.java — aktualizacja systemu prompt

**File**: `src/main/java/com/example/clearkyc/analysis/ExtractionService.java`

**Intent**: Zmień format JSON w systemie prompt — klucz `"pageNumber"` na `"page"` w 3 miejscach — żeby LLM emitował JSON pasujący do nowej nazwy pola w Citation.

**Contract**: Trzy miejsca w tekście promptu do zmiany:
- linia 42: `"citations":[{"quote":"<verbatim text>","page":<n>}]}`
- linia 55: `- "page" is best-effort (0 if unknown).`
- linia 58: `"citations":[{"quote":"<text>","page":<n>}]}`

### Success Criteria

#### Automated Verification

- Testy kompilują się i przechodzą: `./mvnw test`
- Brak referencji do `pageNumber` w całym projekcie: `grep -rn "pageNumber" src/`

#### Manual Verification

- Uruchomić backend i frontend
- Załadować case z analizą, kliknąć cytat w ExtractionForm
- PDF viewer przeskakuje do właściwej strony
- Tekst cytatu jest podświetlony
- Pole "str. X" przy cytacie pokazuje numer strony (nie "str. undefined" lub "str. 0")

**Po tej fazie zatrzymaj się i zweryfikuj ręcznie zanim przejdziesz do Phase 2.**

---

## Phase 2: Usunięcie SnippetPanel

### Overview

Usunięcie komponentu SnippetPanel z codebase. Komponent już nie jest renderowany w szablonie, nie ma zewnętrznych importów — to dead code wymagający tylko usunięcia plików.

### Changes Required

#### 1. Usunięcie plików komponentu

**File**: `web/src/app/shared/components/snippet-panel/snippet-panel.component.ts`
**File**: `web/src/app/shared/components/snippet-panel/snippet-panel.component.html`
**File**: `web/src/app/shared/components/snippet-panel/snippet-panel.component.scss`

**Intent**: Usuń wszystkie 3 pliki komponentu. Nie istnieją żadne zewnętrzne importy ani references — samo usunięcie wystarczy.

### Success Criteria

#### Automated Verification

- Angular build przechodzi: `cd web && ng build`
- Brak referencji do SnippetPanel: `grep -rn "SnippetPanel\|snippet-panel\|app-snippet" web/src/`

#### Manual Verification

- Aplikacja uruchamia się poprawnie
- Case detail ładuje się bez błędów w konsoli

---

## Testing Strategy

### Manual Testing Steps

1. Uruchom backend: `./mvnw spring-boot:run`
2. Uruchom frontend: `cd web && ng serve`
3. Otwórz case z ukończoną analizą
4. Kliknij przycisk cytatu przy dowolnym polu
5. Zweryfikuj: PDF scrolluje do właściwej strony (numer strony z cytatu)
6. Zweryfikuj: fragment tekstu cytatu jest podświetlony w PDF
7. Zweryfikuj: przycisk cytatu pokazuje "str. N" z poprawnym numerem

### Edge Cases

- Cytat ze strony 0 (LLM nie wiedział numeru strony) — viewer nie scrolluje, to oczekiwane zachowanie
- Kilka cytatów z różnych stron — każde kliknięcie scrolluje do właściwej strony

## References

- Research: `context/changes/citation-scroll-fix/research.md`
- `src/main/java/com/example/clearkyc/analysis/Citation.java`
- `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.ts:34-46`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Naprawa field name

#### Automated

- [x] 1.1 Testy kompilują się i przechodzą: `./mvnw test`
- [x] 1.2 Brak referencji do `pageNumber`: `grep -rn "pageNumber" src/`

#### Manual

- [ ] 1.3 PDF viewer scrolluje do właściwej strony po kliknięciu cytatu
- [ ] 1.4 Tekst cytatu jest podświetlony w PDF
- [ ] 1.5 "str. N" przy cytacie pokazuje poprawny numer

### Phase 2: Usunięcie SnippetPanel

#### Automated

- [ ] 2.1 Angular build przechodzi: `cd web && ng build`
- [ ] 2.2 Brak referencji do SnippetPanel: `grep -rn "SnippetPanel\|snippet-panel\|app-snippet" web/src/`

#### Manual

- [ ] 2.3 Aplikacja uruchamia się poprawnie, case detail bez błędów w konsoli
