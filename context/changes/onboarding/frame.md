# Frame Brief: In-app onboarding for case-detail features

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Nowa osoba zalogowana do ClearKYC nie wie jak się poruszać po aplikacji —
konkretnie: nie rozumie jak działają cytowania, lockowanie i decyzja terminalna.

## Initial Framing (preserved)

- **User's stated cause or approach**: Aplikacja nie ma żadnego onboardingu dla nowych użytkowników
- **User's proposed direction**: Zbudować onboarding żeby nowa osoba wiedziała jak korzystać z systemu
- **Pre-dispatch narrowing**: Problem dotyczy KONKRETNYCH FUNKCJI po zalogowaniu (cytowania, lockowanie, decyzja), nie ogólnej nawigacji. Landing page tłumaczy CO robi apka, ale nie JAK. Odbiorca: zarówno ewaluator kursu jak i docelowy analityk KYB.

## Dimension Map

Problem może mieć źródło w jednym z tych wymiarów:

1. **UI affordance gap** — interaktywne elementy nie komunikują swojej interaktywności; user musi "odgadnąć" że można kliknąć
2. **Workflow sequence gap** — user nie wie jaka jest kolejność kroków (upload → analiza → weryfikacja → decyzja)  ← initial framing
3. **Decision consequence gap** — user nie wie że decyzja jest terminalna (LOCKED = nieodwracalne)
4. **Product knowledge gap** — user nie wie czym są red flags, co znaczą cytacje koncepcyjnie

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| UI affordance gap: citation badges nie są oczywiste jako klikalne | `citation-badge.component.html:6` — tylko `[title]="citation().quote"` (pokazuje treść cytatu, NIE tłumaczy że klik nawiguje PDF); CSS: hover underline (subtle); brak `aria-label` wyjaśniającego zachowanie | STRONG |
| Workflow sequence gap: brak informacji o kolejności kroków | `case-detail.component.html:19-23` — topbar pokazuje stan ale nie "co teraz"; `extraction-form.component.html` — przycisk "Uruchom analizę" jest jedyną wskazówką; brak żadnego tekstu prowadzącego przez sekwencję | STRONG |
| Decision consequence gap: terminalność decyzji nie jest ostrzeżona | `decision-bar.component.html:20-38` — trzy przyciski + "Potwierdź decyzję"; po locku: "Sprawa zablokowana — decyzja zablokowana"; brak ostrzeżenia PRZED konfirmacją że to nieodwracalne | MEDIUM |
| Product knowledge gap: co to są red flags / cytacje koncepcyjnie | Landing page (już zbudowana) tłumaczy flow na wysokim poziomie; `extraction-form.component.html:132` — footnote "Pola bez cytowania traktowane jako Not Disclosed"; red flags mają "Brak zidentyfikowanych red flag." — minimalne wyjaśnienie | WEAK |

## Narrowing Signals

- Użytkownik wskazał konkretne funkcje (cytowania, lockowanie, decyzja) — nie ogólną nawigację; UI affordance gap i workflow sequence gap są silnymi kandydatami
- Landing page pokrywa "CO robi apka", onboarding ma pokryć "JAK" — luka jest wewnątrz case-detail
- Obaj odbiorcy (ewaluator + analityk) potrzebują tego samego wyjaśnienia w tym samym miejscu
- Żaden poprzedni change nie dotyczył discoverability ani help system (`context/changes/` przeszukany)

## Cross-System Convention

Dla enterprise analytic tools standard to jeden z dwóch wzorców: (a) **targeted inline hints** — stały tekst pomocniczy przy elementach, które są nieintuicyjne; (b) **first-use overlay** — jednorazowe (localStorage) kroki wskazujące kluczowe elementy przy pierwszym otwarciu widoku. Aplikacje tej klasy rzadko używają pełnowymiarowych product tour libraries (Shepherd.js, Intro.js) — najczęściej budują minimalne własne overlaye. Żadna z tych konwencji nie jest wdrożona w ClearKYC.

## Reframed (or Confirmed) Problem Statement

> **Rzeczywisty problem to plan do: trzy konkretne affordance gaps w widoku case-detail czynią kluczowe funkcje niewidocznymi dla nowych użytkowników:** (1) citation badges wyglądają jak przypisy literackie, nie jak interaktywne linki nawigujące PDF; (2) sekwencja kroków (upload → analiza → weryfikacja → decyzja) nie jest komunikowana w UI; (3) terminalny charakter decyzji compliance nie jest zaznaczony przed konfirmacją.

Framing "zbuduj onboarding" jest poprawny w kierunku, ale bez zawężenia do tych trzech punktów plan ryzykuje nadbudowę — np. pełny product tour obejmujący wszystko zamiast celowanych interwencji w miejscach gdzie rzeczywiście brakuje wskazówek.

## Confidence

**MEDIUM** — evidence dla dwóch głównych wymiarów (affordance + workflow) jest STRONG z file:line; wymiar "decision consequence" jest MEDIUM (przycisk jest widoczny, ale nikt nie wskazał braku ostrzeżenia jako konkretną obserwację); "product knowledge gap" jest WEAK (landing page częściowo to pokrywa). Granica między "targeted inline hints" a "first-use overlay" jest decyzją projektową dla /10x-plan, nie framing question.

## What Changes for /10x-plan

Plan powinien być skupiony na TRZECH punktach interwencji w `case-detail`: (1) citation badge — dodać affordance że klik = nawigacja PDF; (2) workflow sequence — komunikować "co teraz" w każdym stanie (`CREATED`, `ANALYZING`, `ANALYZED`, `LOCKED`); (3) decision bar — dodać ostrzeżenie o terminalności przed konfirmacją. Wybór formy (inline hints vs first-use overlay) to kluczowa decyzja dla /10x-plan.

## References

- Source files:
  - `web/src/app/features/case-detail/case-detail.component.html:1-38`
  - `web/src/app/features/case-detail/components/extraction-form/extraction-form.component.html:29-131`
  - `web/src/app/shared/components/citation-badge/citation-badge.component.ts:16-19`
  - `web/src/app/shared/components/decision-bar/decision-bar.component.html:5-47`
  - `web/src/app/core/store/case.store.ts:1-65`
- Landing page (już zbudowana): `context/changes/landing-page/`
- Investigation tasks: Task #1 (case-detail features), Task #2 (existing hints scan)
