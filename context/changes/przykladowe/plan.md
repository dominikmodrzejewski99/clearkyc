# Przykładowe dokumenty demo (sample KYB tiles) Implementation Plan

## Overview

Na ekranie uploadu nowej sprawy (`/cases/new`) dodajemy 3 klikalne kafelki z gotowymi przykładowymi dokumentami KYB (B2B PDF). Kliknięcie kafelka ładuje dany plik do istniejącego flow upload/ekstrakcji identycznie jak wybór pliku przez dropzone — tak, żeby oceniający projekt (10xDevs demo day) mógł od razu zobaczyć pełne działanie ekstrakcji bez szukania/przygotowywania własnych dokumentów.

## Current State Analysis

- `web/src/app/features/case-new/case-new.component.html:30-48` renderuje `<app-file-dropzone>` gdy `!selectedFile()`, a po wyborze pliku kartę `.file-card` z podglądem.
- `FileDropzoneComponent` (`web/src/app/shared/components/file-dropzone/file-dropzone.component.ts`) nie ma `@Input` do wstrzyknięcia pliku z zewnątrz — jedyny publiczny interfejs to `@Output() fileSelected`.
- `caseService.createCase(file: File)` (`web/src/app/core/services/case.service.ts:10-14`) buduje `FormData` z dowolnym `Blob`/`File` — programowo utworzony `File` z `fetch()` działa identycznie jak plik z dysku.
- Backend `CaseController.java:45-47` twardo odrzuca upload, jeśli `file.getContentType() !== "application/pdf"` — pobrany przez `fetch()` `Blob` trzeba jawnie owinąć w `new File([blob], name, { type: 'application/pdf' })`.
- `web/public/` (skonfigurowane w `angular.json:23-31` jako `assets` glob) jest kopiowane 1:1 do builda (dev i prod, w tym do `src/main/resources/static` serwowanego przez Spring Boot) — właściwe miejsce na statyczne pliki PDF pobierane w runtime.
- Istnieje już jeden dokument referencyjny: `demo-assets/northgate-holdings-articles.{html,pdf}` — Northgate Holdings Limited (BVI), demonstruje nominee director + niejawnego UBO (opaque ownership). Katalog `demo-assets/` nie jest obecnie w ogóle podpięty do aplikacji (ani frontu, ani backendu).
- Brak w repo jakiegokolwiek skryptu HTML→PDF. Playwright (Chromium) jest już dev-dependency projektu (`web/playwright.config.ts`, `web/e2e/`) i ma wbudowane `page.pdf()` — może posłużyć jako silnik renderowania bez nowej zależności.

## Desired End State

Na `/cases/new`, dopóki `!selectedFile()`, pod dropzone widnieje sekcja "Albo wypróbuj przykład" z 3 kafelkami (Northgate Holdings — istniejący, plus 2 nowe: czysty przypadek bez red flag, oraz przypadek z sankcjami/PEP). Kliknięcie kafelka pobiera odpowiedni PDF z `web/public/demo/`, tworzy z niego `File` i przekazuje go do istniejącego `onFileSelected()` — dalszy flow (podgląd `.file-card`, ręczne zatwierdzenie, upload, ekstrakcja) jest niezmieniony. Błąd pobrania pliku pokazuje inline komunikat przy danym kafelku z możliwością ponowienia.

Weryfikacja: `ng build` (i finalny `./mvnw package` serwujący SPA) zawiera 3 pliki PDF pod `/demo/*.pdf`; kliknięcie każdego kafelka na `/cases/new` skutkuje pojawieniem się `.file-card` z poprawną nazwą i rozmiarem pliku, a "Rozpocznij ekstrakcję" prowadzi do normalnego flow ekstrakcji.

### Key Discoveries:

- `case-new.component.ts:32-35` `onFileSelected(file: File)` jest już jedynym punktem wejścia do stanu `selectedFile` — kafelki mogą wołać tę samą metodę, omijając `FileDropzoneComponent` całkowicie (mniej inwazyjne niż dodawanie `@Input` do dropzone).
- Nazwa pliku wysłanego w `FormData` staje się `entityName` sprawy po stronie backendu (`CaseController.java:48-51`) — nazwy plików PDF powinny być czytelnymi identyfikatorami (np. `northgate-holdings-articles.pdf`), nie generycznymi (`sample-1.pdf`).
- `web/e2e/CLAUDE.md:15` wymaga, by nazwa testu e2e wiązała się z ryzykiem z `context/foundation/test-plan.md`. Ta funkcja (wygoda demo) nie odpowiada żadnemu udokumentowanemu tam ryzyku biznesowemu — nie dodajemy dla niej nowego testu e2e; pokrycie ogranicza się do testu jednostkowego logiki ładowania + ręcznej weryfikacji wizualnej.

## What We're NOT Doing

- Nie zmieniamy `FileDropzoneComponent` (brak nowego `@Input`/API) — kafelki wołają `onFileSelected()` bezpośrednio.
- Nie dodajemy trwałego mechanizmu zarządzania katalogiem przykładów (CMS, config z backendu) — lista 3 dokumentów jest statyczną stałą w komponencie.
- Nie dodajemy nowego testu e2e (brak powiązanego ryzyka w `test-plan.md`) — patrz Key Discoveries.
- Nie zmieniamy istniejącego `demo-assets/northgate-holdings-articles.pdf` treściowo — jest kopiowany, nie edytowany.
- Nie automatyzujemy generowania PDF przy każdym buildzie — pliki PDF są generowane raz, ręcznie, i commitowane jako statyczne assety.

## Implementation Approach

1. Autorstwo treści: dwa nowe dokumenty HTML (wzorowane strukturalnie na `demo-assets/northgate-holdings-articles.html`) + jednorazowy skrypt Playwright renderujący HTML→PDF, tak jak analogiczny wzorzec jednorazowego skryptu `web/scripts/render-store-hub.mjs`.
2. Finalne 3 pliki PDF trafiają do `web/public/demo/*.pdf` (serwowane statycznie), źródłowe `.html` zostają jako materiał roboczy w `demo-assets/`.
3. `CaseNewComponent` dostaje statyczną listę `sampleDocuments` (id, ścieżka, nazwa, tag scenariusza) oraz metodę `loadSampleDocument()` (fetch → Blob → File → `onFileSelected()`), plus stan ładowania/błędu per-dokument.
4. Szablon HTML dostaje sekcję kafelków renderowaną w tym samym bloku `@if (!selectedFile())` co dropzone, stylowaną spójnie z istniejącym `.file-card`/`.upload-hero`.

## Phase 1: Dwa nowe przykładowe dokumenty KYB

### Overview

Tworzymy treść i pliki PDF dla dwóch nowych scenariuszy demo, uzupełniających istniejący Northgate (opaque ownership): (a) czysty przypadek bez red flag, (b) przypadek z powiązaniem sankcyjnym/PEP — zgodnie z kategoriami red-flag taxonomy z `context/foundation/prd.md` (sanctions exposure, shell-company indicators, jurisdiction risk, opaque ownership, PEP linkage, sector-specific risk).

### Changes Required:

#### 1. Dokument "czysty przypadek"

**File**: `demo-assets/meridian-retail-group.html`

**Intent**: Prosta spółka UK Ltd z jednym dyrektorem i jednym udziałowcem-osobą fizyczną (100% bezpośrednie udziały, w pełni ujawniony UBO), bez żadnych red flag — demonstruje happy path ekstrakcji (company name, directors, UBO) bez komplikacji.

**Contract**: Ta sama struktura sekcji co `demo-assets/northgate-holdings-articles.html` (dane rejestrowe spółki, sekcja Directors, sekcja Share Capital/Beneficial Ownership) — w języku angielskim (spójnie z Northgate), realistyczne fikcyjne dane (nazwa firmy, numer rejestracyjny, adres, imię i nazwisko dyrektora/UBO).

#### 2. Dokument "sankcje / PEP"

**File**: `demo-assets/bosphorus-trading-fze.html`

**Intent**: Spółka w wolnej strefie (np. ZEA), której UBO/dyrektor jest osobą politycznie eksponowaną (PEP) lub powiązaną z jurysdykcją wysokiego ryzyka — demonstruje red flagę z kategorii "PEP linkage" / "jurisdiction risk" z zamkniętej taksonomii PRD.

**Contract**: Ta sama struktura sekcji co Northgate, z jawnym zapisem wskazującym powiązanie UBO z funkcją publiczną/PEP status i jurysdykcją podwyższonego ryzyka (do zacytowania verbatim przez ekstrakcję zgodnie z FR-008).

#### 3. Skrypt renderujący HTML → PDF

**File**: `web/scripts/render-sample-pdf.mjs`

**Intent**: Jednorazowy skrypt uruchamiany ręcznie (`node web/scripts/render-sample-pdf.mjs`), który dla każdego z 3 plików HTML (Northgate + 2 nowe) renderuje PDF przez Playwright Chromium (`page.pdf()`) i zapisuje wynik do `demo-assets/<nazwa>.pdf`, a następnie kopiuje wszystkie 3 finalne PDF-y do `web/public/demo/<nazwa>.pdf`.

**Contract**: Skrypt korzysta z `playwright` (już w `web/package.json` devDependencies) — `chromium.launch()` → `page.goto('file://' + htmlPath)` → `page.pdf({ path, format: 'A4' })`. Lista wejściowa to statyczna tablica trzech par (html, pdf-name) zdefiniowana w skrypcie.

### Success Criteria:

#### Automated Verification:

- [ ] Skrypt wykonuje się bez błędów: `node web/scripts/render-sample-pdf.mjs`
- [ ] 3 pliki PDF istnieją pod `web/public/demo/`: `ls web/public/demo/*.pdf` zwraca 3 wpisy

#### Manual Verification:

- [ ] Każdy z 3 wygenerowanych PDF-ów otwiera się poprawnie i zawiera czytelną treść (nazwa firmy, sekcja dyrektorów, sekcja UBO/beneficial ownership)
- [ ] Treść dokumentu "czysty przypadek" nie zawiera żadnych sformułowań sugerujących red flagi
- [ ] Treść dokumentu "sankcje/PEP" jednoznacznie opisuje powiązanie z PEP/jurysdykcją wysokiego ryzyka w sposób możliwy do zacytowania verbatim

---

## Phase 2: Kafelki z przykładami w UI uploadu

### Overview

Dodajemy do `CaseNewComponent` katalog 3 przykładowych dokumentów i mechanizm ładowania pliku statycznego jako `File`, plus sekcję kafelków w szablonie, widoczną dopóki nie wybrano własnego pliku.

### Changes Required:

#### 1. Katalog przykładowych dokumentów i logika ładowania

**File**: `web/src/app/features/case-new/case-new.component.ts`

**Intent**: Dodać statyczną listę 3 przykładowych dokumentów (id, ścieżka pod `/demo/*.pdf`, wyświetlana nazwa firmy, krótki tag scenariusza) oraz metodę, która dla wybranego dokumentu robi `fetch(path)` → `blob()` → `new File([blob], filename, { type: 'application/pdf' })` → wywołuje istniejące `onFileSelected(file)`. Metoda śledzi id aktualnie ładowanego dokumentu (do stanu "Wczytywanie…" na konkretnym kafelku) oraz id dokumentu, którego pobranie się nie powiodło (do inline komunikatu błędu z możliwością ponowienia).

**Contract**: Nowe protected sygnały: `loadingSampleId = signal<string | null>(null)`, `sampleErrorId = signal<string | null>(null)`; nowa metoda `protected loadSampleDocument(doc: SampleDocument): void`; stała `protected readonly sampleDocuments: SampleDocument[]` z typem `{ id: string; path: string; entityName: string; tag: string }` zdefiniowanym lokalnie lub w `core/models`. Nazwa pliku przekazana do `new File(...)` musi odpowiadać nazwie pliku PDF (bez ścieżki), tak by backendowy `entityName` (pochodzący z `originalFilename` bez `.pdf`) był czytelny.

#### 2. Sekcja kafelków w szablonie

**File**: `web/src/app/features/case-new/case-new.component.html`

**Intent**: Bezpośrednio pod `<app-file-dropzone>` (w tym samym bloku `@if (!selectedFile())`), dodać etykietę "Albo wypróbuj przykład" i listę 3 klikalnych kafelków (`<button>`, nie link — akcja lokalna, brak nawigacji), każdy pokazujący nazwę firmy i tag scenariusza. Kafelek w trakcie ładowania jest wizualnie oznaczony (np. tekst "Wczytywanie…") i zablokowany (`disabled`); kafelek, którego pobranie zawiodło, pokazuje inline komunikat błędu, pozostając klikalnym do ponowienia.

**Contract**: `@for (doc of sampleDocuments; track doc.id)` renderujący `<button type="button" [disabled]="loadingSampleId() === doc.id" (click)="loadSampleDocument(doc)">`; warunkowe `@if (loadingSampleId() === doc.id)` i `@if (sampleErrorId() === doc.id)` wewnątrz kafelka.

#### 3. Style kafelków

**File**: `web/src/app/features/case-new/case-new.component.scss`

**Intent**: Nowe klasy (`.sample-docs`, `.sd-label`, `.sd-tiles`, `.sd-tile`, `.sd-name`, `.sd-tag`, `.sd-loading`, `.sd-error`) spójne wizualnie z istniejącym `.file-card`/`.upload-hero` (te same zmienne CSS `var(--surface-*)`, `var(--text-*)`, `var(--border-*)`, `var(--radius-*)`).

**Contract**: Layout kafelków jako pozioma lub responsywna siatka (`display: flex` z `flex-wrap: wrap` lub `display: grid`), każdy kafelek `max-width` dopasowany do `.upload-hero`/`.file-selected` (480-520px kontener).

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck przechodzi: `cd web && npx tsc --noEmit -p tsconfig.json`
- [ ] Lint przechodzi (jeśli skonfigurowany): sprawdzić `web/package.json` dla skryptu `lint` i uruchomić jeśli istnieje

#### Manual Verification:

- [ ] Na `/cases/new`, przy braku wybranego pliku, widoczne są 3 kafelki pod dropzone z poprawnymi nazwami i tagami
- [ ] Kliknięcie kafelka Northgate pokazuje `.file-card` z nazwą `northgate-holdings-articles.pdf` i poprawnym rozmiarem
- [ ] Kliknięcie każdego z pozostałych 2 kafelków analogicznie pokazuje odpowiedni plik
- [ ] "Rozpocznij ekstrakcję" po wybraniu przykładu tworzy sprawę i przechodzi do `/cases/:id` tak samo jak dla pliku wgranego ręcznie
- [ ] Symulacja błędu sieci (np. DevTools offline) podczas klikania kafelka pokazuje inline komunikat błędu przy tym kafelku, bez blokowania pozostałych kafelków

---

## Phase 3: Test jednostkowy logiki ładowania przykładu

### Overview

Pokrywamy testem jednostkowym samą logikę `loadSampleDocument()` (fetch → File → wywołanie `onFileSelected`), zgodnie z konwencją `test-plan.md` §6.3 dla komponentów Angular (Vitest, standalone `imports:`, mock `CaseStore` przez `createCaseStoreMock()`).

### Changes Required:

#### 1. Test komponentu

**File**: `web/src/app/features/case-new/case-new.component.spec.ts`

**Intent**: Zmockować globalny `fetch` (zwracający `Response` z `Blob` typu `application/pdf`), kliknąć (lub wywołać bezpośrednio) `loadSampleDocument()` dla jednego z przykładowych dokumentów, i zweryfikować, że `selectedFile()` zawiera `File` o oczekiwanej nazwie i typie MIME. Dodatkowy test na ścieżkę błędu: zmockowany `fetch` odrzucający Promise → `sampleErrorId()` ustawiony na id klikniętego dokumentu, `selectedFile()` pozostaje `null`.

**Contract**: `TestBed.configureTestingModule({ imports: [CaseNewComponent], providers: [{ provide: CaseStore, useValue: createCaseStoreMock() }, { provide: CaseService, useValue: { listCases: () => of([]), createCase: vi.fn() } }] })`; asercje przez `(fixture.componentInstance as any).selectedFile()` i `.sampleErrorId()` (sygnały protected, dostęp jak w §6.3).

### Success Criteria:

#### Automated Verification:

- [ ] Nowy test przechodzi: `cd web && npx vitest run src/app/features/case-new/case-new.component.spec.ts`
- [ ] Pełny zestaw testów frontowych przechodzi bez regresji: `cd web && npx vitest run`

#### Manual Verification:

- [ ] Brak regresji na istniejącym flow ręcznego wgrywania pliku (dropzone) po zmianach w komponencie

---

## Testing Strategy

### Unit Tests:

- `loadSampleDocument()` — happy path (poprawny fetch → File w `selectedFile`) i ścieżka błędu (fetch reject → `sampleErrorId` ustawiony, `selectedFile` niezmieniony).

### Integration Tests:

- Brak nowych — istniejący flow `createCase()`/upload pozostaje niezmieniony i jest już pokryty (`CaseControllerTest`).

### Manual Testing Steps:

1. Otworzyć `/cases/new`, sprawdzić widoczność i wygląd 3 kafelków.
2. Kliknąć każdy kafelek po kolei, zweryfikować poprawny plik w `.file-card` i poprawne przejście przez cały flow ekstrakcji do decyzji.
3. Zasymulować błąd sieci przy pobieraniu przykładu i zweryfikować inline komunikat błędu + możliwość ponowienia.

## Performance Considerations

Pliki PDF trzymane małe (rząd dziesiątek KB, podobnie do istniejącego `northgate-holdings-articles.pdf` ~56KB) — brak wpływu na czas ładowania strony uploadu.

## Migration Notes

Brak — funkcja czysto addytywna, nie dotyka istniejących danych ani schematu.

## References

- Wzorzec istniejącego dokumentu: `demo-assets/northgate-holdings-articles.html`
- Wzorzec jednorazowego skryptu: `web/scripts/render-store-hub.mjs`
- Konwencja testów komponentów: `context/foundation/test-plan.md` §6.3
- PRD (red-flag taxonomy, FR-006/007/008): `context/foundation/prd.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Dwa nowe przykładowe dokumenty KYB

#### Automated

- [x] 1.1 Skrypt wykonuje się bez błędów: `node web/scripts/render-sample-pdf.mjs` — c791072
- [x] 1.2 3 pliki PDF istnieją pod `web/public/demo/` — c791072

#### Manual

- [x] 1.3 Każdy PDF otwiera się poprawnie i zawiera czytelną treść — c791072
- [x] 1.4 Dokument "czysty przypadek" nie zawiera sformułowań sugerujących red flagi — c791072
- [x] 1.5 Dokument "sankcje/PEP" jednoznacznie opisuje powiązanie z PEP/jurysdykcją wysokiego ryzyka — c791072

### Phase 2: Kafelki z przykładami w UI uploadu

#### Automated

- [x] 2.1 Typecheck przechodzi — 2cd3147
- [x] 2.2 Lint przechodzi (jeśli skonfigurowany) — 2cd3147

#### Manual

- [x] 2.3 3 kafelki widoczne z poprawnymi nazwami i tagami — 2cd3147
- [x] 2.4 Kliknięcie kafelka Northgate pokazuje poprawny plik — 2cd3147
- [x] 2.5 Kliknięcie pozostałych 2 kafelków pokazuje poprawny plik — 2cd3147
- [x] 2.6 "Rozpocznij ekstrakcję" po wyborze przykładu działa jak dla pliku ręcznego — 2cd3147
- [x] 2.7 Symulowany błąd sieci pokazuje inline komunikat błędu bez blokowania innych kafelków — 2cd3147

### Phase 3: Test jednostkowy logiki ładowania przykładu

#### Automated

- [ ] 3.1 Nowy test przechodzi
- [ ] 3.2 Pełny zestaw testów frontowych przechodzi bez regresji

#### Manual

- [ ] 3.3 Brak regresji na istniejącym flow ręcznego wgrywania pliku
