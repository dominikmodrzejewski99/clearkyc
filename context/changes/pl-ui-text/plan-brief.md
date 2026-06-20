# Polonizacja tekstów UI — Plan Brief

> Full plan: `context/changes/pl-ui-text/plan.md`

## What & Why

Wszystkie teksty widoczne dla analityka w UI aplikacji ClearKYC mają być po polsku. Aktualnie interfejs jest dwujęzyczny: część szablonów angielska, część komunikatów (formularze, błędy) już po polsku. Cel: spójna polska aplikacja bez mieszanki językowej.

## Starting Point

6 szablonów HTML i 2 pliki TypeScript zawierają angielskie stringi: nagłówki paneli, przyciski compliance (Approve/Reject/Escalate), etykiety stanu, komunikaty błędów i walidacji, nazwy miesięcy w dacie. Część tekstów (formularz override, locked banner, re-analyze dialog) już jest po polsku.

## Desired End State

Analityk otwierający aplikację widzi w pełni polskie UI: "Wgraj dokument źródłowy", "Ostatnie sprawy", "Zatwierdź / Odrzuć / Eskaluj / Potwierdź decyzję", "Ekstrakcja zakończona", "Nie ujawniono / Brak danych". Jedyne angielskie elementy to akronimy branżowe (KYB, PDF, UBO) i nazwa produktu (ClearKYC).

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) | Source |
|---|---|---|---|
| Przyciski Approve/Reject/Escalate | Przetłumacz (Zatwierdź/Odrzuć/Eskaluj) | Spójna polonizacja całego UI | Plan |
| "Commit decision" | "Potwierdź decyzję" | Unika kolizji ze "Zatwierdź" (Approve) | Plan |
| "Not Disclosed / Inferred Missing" | "Nie ujawniono / Brak danych" | Zrozumiałe bez znajomości angielskiego | Plan |
| Badge labels | Zatwierdzona/Odrzucona/Eskalowana/W toku | Spójna PL terminologia na liście spraw | Plan |
| Nazwy miesięcy | Sty/Lut/Mar/Kwi/Maj/Cze/Lip/Sie/Wrz/Paź/Lis/Gru | Spójna PL lokalizacja dat | Plan |
| Akronimy (KYB, PDF, UBO) | Zostaw angielskie | Standardowe terminy branżowe | Plan |
| System i18n | Nie wdrażamy | Prosta zamiana stringów, brak potrzeby abstrakcji | Plan |

## Scope

**W zakresie:**
- 6 szablonów HTML: case-new, file-dropzone, decision-bar, extraction-form, pdf-viewer, workstation-topbar
- 2 pliki TS: case-new.component.ts (error, badge labels, miesiące), file-dropzone.component.ts (walidacja)
- Polska deklinacja liczby pól (pole / pola / pól)

**Poza zakresem:**
- Nazwa produktu ClearKYC i brand mark "CK"
- Akronimy: KYB, PDF, UBO, compliance
- Wartości enum API: LOCKED, ANALYZED, APPROVE, REJECT, ESCALATE
- `app.html` (domyślna strona Angular startowa, nie routowana)
- System i18n (ngx-translate itp.)

## Architecture / Approach

Bezpośrednia zamiana ciągów w plikach. Jedyna złożoność niestandardowa: `getCaseBadgeLabel()` wymaga przepisania z dynamicznej kapitalizacji na jawną mapę PL; template w decision-bar wymaga polskich form deklinacyjnych liczebnika (pole/pola/pól).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Zamiana wszystkich tekstów | Cały UI po polsku (8 plików) | Przeoczenie dynamicznego stringa lub deklinacja liczebnika |

**Prerequisites:** Działające środowisko dev (ng serve)
**Estimated effort:** ~1 sesja, 1 faza

## Open Risks & Assumptions

- Deklinacja w decision-bar (`missingFieldsCount()`) uproszczona: obsługuje 1/2-4/5+ ale nie 11-14 (rzadki przypadek w praktyce compliance)
- `getCaseBadgeLabel()` zmiana z dynamicznej kapitalizacji na jawną mapę — wymaga testu z każdym statusem

## Success Criteria (Summary)

- `npx tsc --noEmit` i `npx ng build` przechodzą bez błędów
- Cały flow (upload → analiza → decyzja) widoczny po polsku w przeglądarce
- Brak angielskich stringów widocznych dla użytkownika poza zdefiniowanymi wyjątkami (KYB, PDF, ClearKYC)
