# Contributors Map - Artifact 3: Authorship Analysis

Generated: 2026-06-22. Zakres: ostatnie 12 miesięcy (2026-05-20 - 2026-06-22), 90 commitów.
Metoda: `git log --format`, `Co-Authored-By` trailers, klasyfikacja tematyczna per commit scope.

---

## Wynik filtrowania

| Typ podmiotu | Commitów | Status |
|---|---|---|
| Dominik Modrzejewski `<dominikmodrzejewski@wp.pl>` | 90 / 90 jako autor | Jedyny ludzki kontrybutor |
| Claude Sonnet 4.6 `<noreply@anthropic.com>` | 65 jako `Co-Authored-By` | Odfiltrowany - agent AI |
| Claude Opus 4.7 `<noreply@anthropic.com>` | 17 jako `Co-Authored-By` | Odfiltrowany - agent AI |

Po odfiltrowaniu: **jeden kontrybutor ludzki**. Projekt jest single-author z AI jako narzędziem wykonawczym w 82/90 commitów (91%).

Czysto ludzkie commity (bez `Co-Authored-By`): 8 - głównie archiwizacje planów i 2 commity featury:
- `feat(extraction-streaming-ux): skeleton placeholder + shimmer streaming gap (p1)`
- `feat(onboarding): first-use overlay with 3-step tour and localStorage persistence (p2)`
- `feat(onboarding): inline affordance hints for citation, decision and callout (p1)`

---

## Dominik Modrzejewski - aktywności tematyczne

| Motyw (commit scope) | Commitów | Charakter pracy | Związek z hotspotami |
|---|---|---|---|
| `testing-frontend-critical-flows` | 8 (AI) | Strategia testów, E2E, spec-pliki | extraction-form (obszar #5) |
| `field-verification-export` | 8 (AI) | Eksport i weryfikacja pól ekstrakcji | extraction-form (obszar #5) |
| `core-case-flow` | 7 (AI) | Przepływ: upload → ekstrakcja → decyzja | case.store (obszar #1), case-detail (obszar #3) |
| `llm-streaming-backend` | 5 (AI) | Backend SSE + kontrakt API | extraction-stream.service (obszar #2) |
| `wcag-ux-review` | 5 (AI) | Dostępność ARIA, focus, kolory, CDK | case-detail (obszar #3), decision-bar (obszar #4) |
| `red-flag-taxonomy` | 5 (AI) | Klasyfikacja ryzyk domenowych | citation-badge, decision-bar (obszar #4) |
| `frontend-scaffold` | 5 (AI) | Architektura Angular: warstwy, routing, store | case.store (obszar #1), shared/ (obszar #4) |
| `auth-scaffold` | 5 (AI) | Auth0, guardy, przepływ tokenu | extraction-stream.service (obszar #2) |
| `dev` | 5 (mieszane) | Konfiguracja środowiska, proxy, porty | extraction-stream.service (obszar #2) |
| `workstation-detail-fidelity` | 4 (AI) | Dopracowanie UI workstacji analityka | case-detail (obszar #3) |
| `design-system-wire` | 4 (AI) | Design system, tokeny, SCSS | decision-bar, shared/ (obszar #4) |
| `roadmap` | 4 (mieszane) | Planowanie iteracji | - |
| `onboarding` | 3 (**ludzkie**) | Tour, overlay, affordance hints | citation-badge, case-detail |

---

## Mapowanie na top 5 obszarów ryzyka (z artifact-2)

### Obszar #1 - `case.store.ts` (Ca=6, ukryty hub)

Zaangażowane motywy: `frontend-scaffold` + `core-case-flow` (oba 100% AI-assisted).

Decyzja o Angular Signals jako mechanizmie store, wzorzec mutacji, powód bezpośrednich importów z `shared/` - podjęte w sesjach AI bez ciągłości między nimi. Wiedza architektoniczna istnieje wyłącznie w `context/changes/core-case-flow/` i `context/changes/frontend-scaffold/` oraz pamięci Dominika.

**Głębokość wiedzy własnej:** umiarkowana - Dominik definiował wymagania, AI implementował.

---

### Obszar #2 - `extraction-stream.service.ts` (Auth0 + SSE)

Zaangażowane motywy: `llm-streaming-backend` + `auth-scaffold` + `dev`.

Protokół SSE, flow tokenu Auth0, URL z `environment.ts` - wszystko napisane przy wsparciu AI. Jedyne miejsce bezpośredniego kontaktu Dominika bez AI: 5 commitów `dev` (ręczne poprawki środowiska: porty, CORS, proxy, skip-auth w dev profile).

**Głębokość wiedzy własnej:** niska dla protokołu SSE/Auth0, wysoka dla konfiguracji środowiska.

---

### Obszar #3 - `case-detail.component.ts` + import `AppLayoutComponent`

Zaangażowane motywy: `core-case-flow` + `workstation-detail-fidelity` + `wcag-ux-review`.

Decyzja o bezpośrednim imporcie `AppLayoutComponent` w `imports[]` zamiast konfiguracji routerowej pojawiła się prawdopodobnie w `frontend-scaffold` lub `core-case-flow`. Żaden z commitów dotykających tej decyzji nie jest "czysto ludzki" - wyjaśnienie intencji istnieje tylko w historii sesji AI (niedostępnej po zamknięciu okna).

**Głębokość wiedzy własnej:** umiarkowana - Dominik iterował nad UI workstacji (4 commity `workstation-detail-fidelity`), ale decyzja architektoniczna była AI-driven.

---

### Obszar #4 - `shared/decision-bar` + `citation-badge` (domenowe w shared/)

Zaangażowane motywy: `wcag-ux-review` + `red-flag-taxonomy` + `frontend-scaffold`.

Klasyfikacja tych komponentów jako `shared/` zamiast `features/` prawdopodobnie nie była świadomą decyzją architektoniczną - pattern wyłonił się iteracyjnie w sesjach AI. Wyjątek: 2 czysto ludzkie commity w `onboarding` dotykały `citation-badge` bezpośrednio - Dominik ma bezpośredni kontakt z tym komponentem na poziomie szablonu.

**Głębokość wiedzy własnej:** niska dla decyzji architektonicznej (dlaczego shared/), wysoka dla zachowania UI citation-badge.

---

### Obszar #5 - `extraction-form` - maszyna stanów ekstrakcji

Zaangażowane motywy: `testing-frontend-critical-flows` + `field-verification-export` + `extraction-streaming-ux`.

Jedyny obszar z czysto ludzkim commitem zawierającym logikę produkcyjną:
`feat(extraction-streaming-ux): skeleton placeholder + shimmer streaming gap (p1)` - Dominik napisał szkielet animacji streamingu bez AI. Sugeruje głębsze rozumienie UX stanu streaming niż tylko przez sesje AI.

**Głębokość wiedzy własnej:** wysoka dla UX streaming (czysto ludzki commit), umiarkowana dla logiki stanów RxJS (AI-assisted).

---

## Struktura wiedzy w projekcie

```
Wiedza o projekcie
├── Dominik Modrzejewski (człowiek)
│   ├── Głęboka: wymagania biznesowe, UX decyzje, konfiguracja środowiska
│   ├── Umiarkowana: architektura Angular, przepływ case-flow
│   └── Niska: szczegóły SSE/Auth0, RxJS operators, wzorce store
│
├── Sesje Claude (82 commitów) - NIEDOSTĘPNE po zamknięciu sesji
│   ├── Claude Opus 4.7 (17 commitów) - cięższe decyzje architektoniczne
│   └── Claude Sonnet 4.6 (65 commitów) - implementacja, iteracje UI
│
└── context/changes/ - JEDYNA trwała pamięć między sesjami AI
    ├── core-case-flow/     → wiedza o obszarze #1 i #3
    ├── llm-streaming-backend/ → wiedza o obszarze #2
    ├── frontend-scaffold/  → wiedza o obszarze #4
    └── testing-frontend-critical-flows/ → wiedza o obszarze #5
```

---

## Wniosek praktyczny

Nie ma drugiego człowieka do zadzwonienia. Przed refactoringiem któregokolwiek z 5 obszarów:

1. Sprawdzić `context/changes/<scope>/plan.md` i `change.md` dla odpowiedniego motywu.
2. Obszary #1 i #2 mają najniższą głębokość wiedzy własnej Dominika - wymagają odtworzenia kontekstu z `context/changes/` przed zmianą.
3. Obszary #3 i #5 mają czysto ludzkie commity - Dominik jest najlepszym źródłem wiedzy o intencji.
4. Onboarding nowego współpracownika musi zacząć się od `context/` jako jedynej trwałej dokumentacji decyzji podjętych w sesjach AI.
