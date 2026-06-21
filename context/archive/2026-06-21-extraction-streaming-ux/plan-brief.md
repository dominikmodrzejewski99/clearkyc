# Extraction Streaming UX — Plan Brief

> Full plan: `context/changes/extraction-streaming-ux/plan.md`

## What & Why

Panel ekstrakcji pokazuje pustą białą przestrzeń przed analizą i przez krótki moment po jej
uruchomieniu. Użytkownik nie wie co kliknąć ani czy aplikacja reaguje na jego akcję.
Potrzebne: skeleton placeholder w pustym stanie i animacja shimmer podczas startu streamu.

## Starting Point

`extraction-form.component.html` + `.scss` — jeden komponent. Sygnały `isAnalyzing()`,
`extractionFields().length`, `pdfBlob()` i `caseStatus()` już dostępne w template.
Istniejące animacje: `blink` (cursor per-pole) i `pulse` (topbar dot).

## Desired End State

Użytkownik zawsze widzi feedback:
- Przed analizą (bez PDF): 8 szarych rzędów szkieletowych + tekst "Wgraj plik PDF..."
- Przed analizą (z PDF): te same rzędy + tekst "Kliknij ▶ Uruchom analizę"
- Po kliknięciu (luka startu): te same rzędy z animacją shimmer (przesuwający się gradient)
- Podczas streamu: nowe pola wlatują z fade-in 150ms; blink cursor na polach bez wartości (bez zmian)

## Key Decisions Made

| Decision | Choice | Why (1 zdanie) |
|---|---|---|
| Empty state style | Skeleton placeholder | Pokazuje docelowy układ; spójny z landing page `.skel` |
| Streaming gap | Shimmer na skeleton | Klasyczny loading indicator, nie wymaga nowych sygnałów |
| Typewriter effect | fade-in 150ms + istniejący blink | Minimalna zmiana, unika problemów CSS typewriter z flex-wrap |
| PDF guard | Dwa warianty hint text | Pomaga zrozumieć kolejność kroków bez PDF |

## Scope

**In scope:** `extraction-form.component.html`, `extraction-form.component.scss` — tylko HTML i CSS.

**Out of scope:** TypeScript, serwisy, CaseStore, animacja typewriter znak-po-znaku, tokeny animacji w design systemie.

## Architecture / Approach

Czysty HTML + CSS. Nowy blok `<div class="ef-skeleton">` z 8 statycznie zakodowanymi rzędami
szkieletowymi. Klasa `ef-skeleton--shimmer` aktywna gdy `isAnalyzing() && fields.length === 0`.
`@keyframes rowAppear` na `.field-row` obsługuje fade-in automatycznie przy dodaniu węzła DOM przez Angular `@for`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Skeleton + shimmer | Empty state + luka startu | Dopasowanie grid do .field-row |
| 2. Fade-in wierszy | Animacja wejścia dla streamowanych pól | Migotanie przy dużej liczbie pól |

**Prerequisites:** Żadnych — zmiana czysto frontendowa, nie zależy od innych zmian.
**Estimated effort:** ~1 sesja, 2 małe fazy.

## Open Risks & Assumptions

- `prefers-reduced-motion` nie jest obsługiwane (150ms fade-in i shimmer mogą być odczuwalne);
  do oceny po implementacji — można dodać media query jeśli potrzeba
- Shimmer gradient używa `var(--gray-200)` / `var(--gray-100)` — zakłada że tokeny te istnieją
  w design systemie (potwierdzone w `_variables.scss`)
- 8 rzędów skeleton to estimate; rzeczywista liczba pól w ekstrakcji KYB może się różnić

## Success Criteria (Summary)

- Użytkownik otwierający pustą sprawę widzi skeleton (nie białą przestrzeń)
- Po kliknięciu "Uruchom analizę" widzi shimmer (nie pustą przestrzeń) do momentu pierwszego pola
- Pola ze streamu wlatują płynnie z fade-in
