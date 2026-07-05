# Przykładowe dokumenty demo (sample KYB tiles) — Plan Brief

> Full plan: `context/changes/przykladowe/plan.md`

## What & Why

Na demo day oceniający nie powinien musieć szukać ani przygotowywać własnych dokumentów KYB, żeby zobaczyć flow ekstrakcji w działaniu. Dodajemy 3 klikalne kafelki na ekranie uploadu z gotowymi przykładowymi dokumentami — jeden klik ładuje plik i uruchamia dokładnie ten sam flow co ręczny upload.

## Starting Point

Istnieje już jeden dokument referencyjny (`demo-assets/northgate-holdings-articles.pdf` — ukryty UBO, nominee director), ale katalog `demo-assets/` nie jest w ogóle podpięty do aplikacji. Ekran uploadu (`case-new.component.ts/html`) ma tylko dropzone; nie ma mechanizmu wczytania pliku statycznego bez interakcji użytkownika z systemem plików.

## Desired End State

Pod dropzone na `/cases/new` (dopóki nie wybrano własnego pliku) widoczna jest sekcja "Albo wypróbuj przykład" z 3 kafelkami: Northgate (opaque ownership), nowy czysty przypadek bez red flag, nowy przypadek z sankcjami/PEP. Kliknięcie dowolnego z nich pokazuje standardową kartę wybranego pliku i pozwala przejść przez cały flow ekstrakcji tak samo jak przy własnym uploadzie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Scenariusze 2 nowych dokumentów | Czysty przypadek (brak red flag) + sankcje/PEP | Pokazuje pełne spektrum taksonomii razem z istniejącym Northgate (opaque ownership) |
| Rozmieszczenie w UI | Sekcja kafelków pod dropzone, widoczna zawsze dopóki brak pliku | Nie zasłania głównego flow, jasna hierarchia własny plik > przykład |
| Zachowanie po kliknięciu | Tylko wypełnia `selectedFile`, user nadal klika "Rozpocznij ekstrakcję" | Spójne z FR-005 (jawna akcja Analyze) i istniejącym flow |
| Obsługa błędu fetch | Inline komunikat przy kafelku, możliwość ponowienia | Spójne z istniejącym wzorcem błędów w aplikacji (`uploadError`) |
| Mechanizm wstrzyknięcia pliku | Ominięcie `FileDropzoneComponent`, bezpośrednie wywołanie `onFileSelected()` | Zero zmian w publicznym API dropzone, mniejsza inwazyjność |
| Generowanie PDF | Jednorazowy skrypt Playwright (`page.pdf()`), bez nowej zależności | Playwright już jest dev-dependency (e2e), brak istniejącego HTML→PDF w repo |
| Zakres testów | Test jednostkowy logiki ładowania, brak nowego e2e | Funkcja nie odpowiada żadnemu ryzyku w `test-plan.md`; e2e wymagałoby sztucznego powiązania |

## Scope

**In scope:**
- 2 nowe dokumenty PDF (treść + render) + skrypt renderujący
- Katalog 3 przykładowych dokumentów w komponencie + logika `fetch → File → onFileSelected`
- Kafelki w UI ze stanem ładowania/błędu
- Test jednostkowy logiki ładowania

**Out of scope:**
- Zmiana `FileDropzoneComponent`
- Konfigurowalny/backendowy katalog przykładów
- Nowy test e2e
- Automatyczne generowanie PDF przy każdym buildzie

## Architecture / Approach

Kafelek → `fetch('/demo/<plik>.pdf')` → `Blob` → `new File([blob], name, {type:'application/pdf'})` → istniejący `onFileSelected(file)` → reszta flow (podgląd, submit, `POST /api/cases` multipart) bez zmian. Pliki PDF serwowane statycznie z `web/public/demo/`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dwa nowe dokumenty KYB | 2 nowe pliki PDF + skrypt renderujący | Treść musi być realistyczna i jednoznacznie cytowalna dla LLM |
| 2. Kafelki w UI uploadu | Sekcja kafelków + logika ładowania w `case-new` | Zgodność z backendowym wymogiem `Content-Type: application/pdf` |
| 3. Test jednostkowy | Pokrycie happy path + błędu dla `loadSampleDocument()` | — |

**Prerequisites:** brak — działamy na aktualnym stanie `main`.
**Estimated effort:** ~1 sesja, 3 fazy.

## Open Risks & Assumptions

- Treść 2 nowych dokumentów jest fikcyjna, ale musi być wystarczająco realistyczna, by LLM wyekstrahował sensowne pola i red flagi zgodnie z zamierzonym scenariuszem — wymaga jednej manualnej weryfikacji po Fazie 1 (uruchomienie prawdziwej ekstrakcji na nowych PDF-ach).
- Zakładamy język angielski dla treści dokumentów (spójnie z istniejącym Northgate), mimo że UI aplikacji jest po polsku.

## Success Criteria (Summary)

- Oceniający może na `/cases/new` kliknąć jeden z 3 kafelków i zobaczyć pełny flow ekstrakcji bez przygotowywania własnego pliku.
- Wszystkie 3 dokumenty demonstrują różne scenariusze red-flag taxonomy (opaque ownership, brak flag, sankcje/PEP).
- Błąd sieci przy ładowaniu przykładu nie blokuje reszty aplikacji ani pozostałych kafelków.
