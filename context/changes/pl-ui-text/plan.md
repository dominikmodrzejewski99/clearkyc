# Polonizacja tekstów UI - Plan implementacji

## Overview

Zamiana wszystkich angielskich ciągów widocznych dla użytkownika na język polski we wszystkich komponentach Angular. Zakres: 6 szablonów HTML + 2 pliki TypeScript (string literals). Brak zmian logiki.

## Current State Analysis

UI jest dwujęzyczne: większość szablonów w angielskim, część komunikatów (formularze override, błędy analizy, locked banner) już po polsku. Docelowo cały tekst widoczny dla użytkownika ma być po polsku.

## Desired End State

Analityk widzi cały interfejs po polsku: nagłówki, przyciski, etykiety pól, komunikaty błędów, statusy i etykiety badge. Jedyne wyjątki (patrz "What We're NOT Doing"): skróty techniczne (PDF, KYB) i nazwa produktu (ClearKYC).

**Weryfikacja:** uruchomić aplikację, przejść przez ekran uploadu i ekran analizy, nie znaleźć żadnego angielskiego tekstu widocznego dla użytkownika (poza wyjątkami).

### Key Discoveries

- `decision-bar.component.html:14` - plural form w angielskim (`field` / `fields`) wymaga zamiany na polską deklinację (pole / pola / pól)
- `case-new.component.ts:71` - tablica nazw miesięcy (`'Jan', 'Feb', ...`) do zamiany na PL skróty
- `case-new.component.ts:83-86` - `getCaseBadgeLabel()` generuje etykiety przez dynamic capitalization zamiast explicit map; wymaga przepisania na mapę PL
- `extraction-form.component.html` - część tekstów JUŻ jest po polsku (formularz override, locked banner, re-analyze warning); nie dotykamy ich
- `app.html` - zawiera domyślny starter Angular (`Hello, {{ title() }}`); nie jest routowany w produkcji, pomijamy

## What We're NOT Doing

- Nie tłumaczymy nazwy produktu: `ClearKYC`, `CK` (brand mark)
- Nie tłumaczymy akronimów branżowych: `KYB`, `PDF`, `UBO`
- Nie tłumaczymy słowa `compliance` (używane jako loanword w polskiej branży)
- Nie dotykamy `app.html` (domyślna strona startowa Angular, nie widoczna w działającej aplikacji)
- Nie tłumaczymy wartości enum backendowych: `LOCKED`, `ANALYZED`, `APPROVE`, `REJECT`, `ESCALATE` (są kluczami API, nie tekstem UI)
- Nie wdrażamy żadnego systemu i18n (ngx-translate itp.) - to prosta zamiana stringów

## Implementation Approach

Bezpośrednia zamiana ciągów w plikach. Żadnych abstrakcji i18n. Jedna faza - wszystkie 8 plików.

## Phase 1: Zamiana wszystkich tekstów

### Overview

Podmiana angielskich stringów w 6 szablonach HTML i 2 plikach TypeScript na ich polskie odpowiedniki.

### Changes Required

#### 1. Ekran uploadu nowej sprawy

**File:** `web/src/app/features/case-new/case-new.component.html`

**Intent:** Spolszczyć wszystkie etykiety i komunikaty ekranu uploadu.

**Contract:** Zamiany (EN → PL):
- `KYB Compliance Workstation` → `Stacja analityczna KYB`
- `New case` → `Nowa sprawa`
- `Upload source document` → `Wgraj dokument źródłowy`
- `Upload a corporate PDF for KYB entity extraction and compliance analysis.` → `Wgraj korporacyjny PDF do ekstrakcji podmiotów KYB i analizy compliance.`
- `Ready for analysis` → `Gotowy do analizy`
- `title="Remove file"` → `title="Usuń plik"`
- `Creating case...` → `Tworzenie sprawy...`
- `&#9654; Begin extraction` → `&#9654; Rozpocznij ekstrakcję`
- `Recent cases` → `Ostatnie sprawy`
- `No recent cases` → `Brak ostatnich spraw`
- `cases loaded` → `spraw załadowanych`

---

#### 2. Strefa drag-and-drop

**File:** `web/src/app/shared/components/file-dropzone/file-dropzone.component.html`

**Intent:** Spolszczyć etykiety strefy uploadu pliku.

**Contract:** Zamiany:
- `Drag and drop your document here` → `Przeciągnij i upuść dokument tutaj`
- `or <b>browse files</b> to select` → `lub <b>przeglądaj pliki</b> aby wybrać`
- `PDF · max 50 MB` → bez zmian (format techniczny)

---

#### 3. Pasek decyzji compliance

**File:** `web/src/app/shared/components/decision-bar/decision-bar.component.html`

**Intent:** Spolszczyć cały pasek decyzji; "Approve/Reject/Escalate" → "Zatwierdź/Odrzuć/Eskaluj", obsługa polskiej deklinacji liczby pól z brakującymi danymi.

**Contract:** Zamiany:
- `Compliance decision` → `Decyzja compliance`
- Ostrzeżenie o brakujących polach (linia 14):
  ```html
  ▲ {{ missingFieldsCount() }} {{ missingFieldsCount() === 1 ? 'pole' : missingFieldsCount() <= 4 ? 'pola' : 'pól' }} z brakującymi danymi — zweryfikuj przed decyzją
  ```
- `All required fields resolved — writes to immutable audit record` → `Wszystkie wymagane pola uzupełnione — zapisuje do niezmiennego rejestru audytowego`
- `Approve` → `Zatwierdź`
- `Reject` → `Odrzuć`
- `Escalate` → `Eskaluj`
- `Commit decision` → `Potwierdź decyzję`

---

#### 4. Formularz ekstrakcji

**File:** `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html`

**Intent:** Spolszczyć nagłówek panelu, tagi stanu i etykietę "Not Disclosed / Inferred Missing". Nie dotykać tekstów, które już są po polsku (formularz override, locked banner, dialog re-analyze).

**Contract:** Zamiany:
- `Extraction` (nagłówek pane-head) → `Ekstrakcja`
- `fields · {{ citedFieldsCount() }} cited` → `pól · {{ citedFieldsCount() }} z cytatem`
- `↻ Re-run` → `↻ Ponów`
- `▶ Run analysis` → `▶ Uruchom analizę`
- `Streaming` (state-tag) → `Strumieniowanie`
- `Not Disclosed / Inferred Missing` → `Nie ujawniono / Brak danych`
- `Overridden` (state-tag) → `Nadpisano`
- `Override · {{ field.fieldName }}` (nagłówek formularza override) → `Nadpisanie · {{ field.fieldName }}`
- `Analityk · override` (w override-note) → `Analityk · nadpisano`

---

#### 5. Przeglądarka PDF

**File:** `web/src/app/shared/components/pdf-viewer/pdf-viewer.component.html`

**Intent:** Spolszczyć nagłówek panelu PDF i skrót liczby stron.

**Contract:** Zamiany:
- `Source document` → `Dokument źródłowy`
- `{{ pageCount() }} pp` → `{{ pageCount() }} str.`

---

#### 6. Topbar stacji roboczej

**File:** `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`

**Intent:** Spolszczyć etykiety stanu analizy w topbarze.

**Contract:** Zamiany:
- `Awaiting analysis` → `Oczekuje na analizę`
- `Analysing…` → `Analizowanie…`
- `Extraction complete` → `Ekstrakcja zakończona`

---

#### 7. String literals w komponencie nowej sprawy

**File:** `web/src/app/features/case-new/case-new.component.ts`

**Intent:** Spolszczyć: komunikat błędu tworzenia sprawy, etykiety badge statusu (metoda `getCaseBadgeLabel`) oraz skróty miesięcy w metodzie `formatDate`.

**Contract:**

Linia 59 - komunikat błędu:
- `'Failed to create case. Please try again.'` → `'Nie udało się utworzyć sprawy. Spróbuj ponownie.'`

Linie 71 - tablica miesięcy:
```typescript
const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
```

Linie 83-86 - `getCaseBadgeLabel()`: zastąpić dynamiczne kapitalizowanie jawną mapą PL:
```typescript
protected getCaseBadgeLabel(c: CaseSummary): string {
  const labels: Record<string, string> = {
    approved:  'Zatwierdzona',
    rejected:  'Odrzucona',
    escalated: 'Eskalowana',
    pending:   'W toku',
  };
  return labels[this.getCaseBadgeClass(c)] ?? this.getCaseBadgeClass(c);
}
```

---

#### 8. Komunikaty walidacji pliku

**File:** `web/src/app/shared/components/file-dropzone/file-dropzone.component.ts`

**Intent:** Spolszczyć komunikaty błędów walidacji pliku PDF.

**Contract:** Zamiany:
- `'Only PDF files are supported.'` → `'Obsługiwane są tylko pliki PDF.'`
- `'File exceeds the 50 MB limit.'` → `'Plik przekracza limit 50 MB.'`

---

### Success Criteria

#### Automated Verification

- Typecheck przechodzi bez błędów: `cd web && npx tsc --noEmit`
- Angular build produkcyjny przechodzi: `cd web && npx ng build`

#### Manual Verification

- Ekran `/cases/new`: wszystkie widoczne teksty po polsku; "ClearKYC", "KYB", "PDF" pozostają angielskie
- Wgranie nieprawidłowego pliku: komunikat błędu po polsku ("Obsługiwane są tylko pliki PDF.")
- Wgranie pliku > 50 MB: komunikat po polsku
- Sidebar "Ostatnie sprawy": badge statusu po polsku (Zatwierdzona / Odrzucona / Eskalowana / W toku), daty z polskimi skrótami miesięcy
- Ekran analizy (case-detail): nagłówek "Ekstrakcja", topbar pokazuje "Oczekuje na analizę" / "Analizowanie…" / "Ekstrakcja zakończona"
- Panel PDF: nagłówek "Dokument źródłowy", liczba stron jako "N str."
- Pasek decyzji: przyciski "Zatwierdź / Odrzuć / Eskaluj / Potwierdź decyzję"; komunikat ostrzeżenia o polach z brakującymi danymi po polsku
- Pola bez wartości: etykieta "Nie ujawniono / Brak danych"
- Tagi stanu: "Strumieniowanie" / "Nadpisano"
- Brak angielskich stringów widocznych w normalnym flow UI (z wyjątkami: ClearKYC, KYB, PDF, compliance)

---

## Testing Strategy

### Automated

- `npx tsc --noEmit` - wyłapuje literówki w template expressions po edycji `.ts`
- `npx ng build` - kompilacja produkcyjna wyłapuje błędy szablonów HTML

### Manual Testing Steps

1. Uruchomić `ng serve` i otworzyć http://localhost:4201
2. Przejść przez ekran nowej sprawy: zweryfikować wszystkie etykiety
3. Wgrać plik nieobsługiwanego formatu: zweryfikować komunikat błędu PL
4. Wgrać plik i uruchomić analizę: zweryfikować topbar, nagłówki paneli, tagi stanu
5. Po zakończeniu analizy: zweryfikować pasek decyzji i przyciski

## References

- Roadmap: `context/foundation/roadmap.md` (S-06)
- Change: `context/changes/pl-ui-text/change.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Zamiana wszystkich tekstów

#### Automated

- [x] 1.1 Typecheck przechodzi: `cd web && npx tsc --noEmit`
- [x] 1.2 Angular build produkcyjny przechodzi: `cd web && npx ng build`

#### Manual

- [x] 1.3 Ekran /cases/new: wszystkie etykiety po polsku, wyjątki (ClearKYC, KYB, PDF) angielskie
- [x] 1.4 Walidacja pliku: komunikaty błędów po polsku
- [x] 1.5 Sidebar: badge statusu i miesiące daty po polsku
- [x] 1.6 Case detail: nagłówki paneli, topbar statusy, pasek decyzji po polsku
- [x] 1.7 Tagi stanu (Strumieniowanie, Nadpisano) i etykieta "Nie ujawniono / Brak danych" po polsku
