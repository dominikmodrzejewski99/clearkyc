# Frame Brief: Landing Page for ClearKYC

> Framing step before /10x-plan. Separates the observation from assumptions,
> clarifies the plan format before planning begins.

## Reported Observation

Aplikacja ClearKYC nie ma żadnej publicznej trasy. Każda strona wymaga
zalogowania (`canActivate: [authGuard]`). Root route `/` redirekcjonuje
na `/cases/new`, która jest chroniona. Nowy odwiedzający widzi tylko
ekran logowania Auth0 bez żadnego kontekstu co do produktu.

## Initial Framing (preserved)

- **User's stated cause or approach**: Potrzebna landing page bez auth-guardu
  tłumacząca jak aplikacja działa i jakie problemy rozwiązuje.
- **User's proposed direction**: Zrobić plan który posłuży jako wejście do
  Claude Design - "tak jak cały design-system".
- **Pre-dispatch narrowing**: Odbiorca to evaluator kursu 10xDevs (nie analityk
  bankowy). Format: opis tekstowy sekcji + rzeczy potrzebne do frontendu.
  Nowa trasa w istniejącej aplikacji Angular (np. `/`).

## Dimension Map

Obserwacja może wymagać decyzji w kilku wymiarach:

1. **Routing** - gdzie siedzi publiczna trasa i jak obsługuje zalogowanych
2. **Content narrative** - jakim językiem opisać produkt (analityk vs. evaluator)
3. **Plan format** - design brief dla Claude Design vs. plan implementacji ← kluczowy
4. **Design system fit** - clinical back-office tokens na landing page dla zewnętrznego odbiorcy

## Hypothesis Investigation

| Hipoteza | Dowód | Werdykt |
|---|---|---|
| Potrzebna nowa publiczna trasa Angular | `app.routes.ts:3` - wszystkie trasy mają `canActivate: [authGuard]`; `/` redirectuje na chronioną trasę. Catch-all `**` też → `cases/new`. | STRONG |
| Istniejący design system wystarczy dla landing page | `_variables.scss`: 100+ tokenów, IBM Plex Sans, blue-500 (#2A6FB0) jako akcent, gray spine, shadow-md dla kart. W pełni używalny. | STRONG |
| Plan ma być design briefem (sekcje + treść), nie planem implementacji | User potwierdził "opis tekstowy sekcji i rzeczy potrzebne do frontendu" - nie lista plików do edycji jak design-system-wire. | STRONG |
| Narracja dla nie-bankowca wymaga innego tonu | PRD używa terminologii branżowej (KYB, UBO, SAR). Evaluator kursu potrzebuje plain-language opisu problemu i rozwiązania. | STRONG |

## Narrowing Signals

- Odbiorca kursu 10xDevs (nie bank) → narracja plain-language, bez zakładania
  znajomości KYB/UBO/SAR
- Format to "opis tekstowy sekcji" → brief dla Claude Design, nie implementation plan
- Angular SPA, istniejąca trasa → LandingPageComponent bez canActivate, route `/`
  z logiem "jeśli auth'd → redirect /cases/new"

## Cross-System Convention

Design system ClearKYC jest "clinical, authoritative" - stworzony dla dense
back-office monitorów. Landing page to inny kontekst: więcej whitespace, większa
typografia, sekcje z nagłówkami. Konwencja: użyć tych samych tokenów, ale
z luźniejszym spacingiem - `--space-16`/`--space-20` dla sekcji zamiast
`--space-4`/`--space-6` typowych w workstation. Nadal IBM Plex, nadal
`--blue-500` jako akcent, nadal `--text-primary` gray-900.

## Reframed (or Confirmed) Problem Statement

> **Faktyczny problem do zaplanowania to**: zaprojektowanie design briefu
> (sekcje + treść + wskazówki tokenów) który Claude Design może zamienić
> w mockup landing page, a potem `/10x-plan` może zamienić w implementation plan.

Kluczowa różnica vs. initial framing: "plan do Claude Design" to NIE jest
`/10x-plan` - to artefakt wejściowy DLA Claude Design (brief z sekcjami,
copyem, tokenami). Plan implementacji Angular (dodanie trasy, komponentu,
scss) przychodzi PO wygenerowaniu mockupu przez Claude Design.

Innymi słowy: są tu DWA kroki:
1. `/10x-plan landing-page` → pisze design brief (sekcje, treść, tokeny) dla Claude Design
2. Claude Design generuje mockup
3. `/10x-plan landing-impl` lub update tego planu → techniczny plan Angular

## Confidence

**HIGH** - routing gap potwierdzony w kodzie, format planu potwierdzony przez usera,
design system w pełni zbadany.

## What Changes for /10x-plan

Plan powinien być **design briefem**, nie implementation planem:
- Sekcje landing page z propozycją treści (po polsku lub angielsku - do decyzji)
- Dla każdej sekcji: które tokeny CSS (`--surface-*`, `--text-*`, spacing),
  jakie komponenty (jeśli reuse istniejących)
- Routing note: jedna linijka jak dodać publiczną trasę Angular (dla kontekstu
  dla Claude Design, żeby wiedział to jest Angular SPA)
- Bez faz implementacji, bez file:line listy zmian - to zostaje na potem

## References

- Routing: `web/src/app/app.routes.ts:3-16`
- Auth guard: `web/src/app/core/guards/auth.guard.ts:7-24`
- Design tokens: `web/src/styles/design-system/_variables.scss`
- Design system docs: `context/foundation/design-system/`
- PRD (problem statement dla copy): `context/foundation/prd.md:22-24`
