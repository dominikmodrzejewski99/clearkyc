# Frame Brief: Deploy clearkyc na Fly.io zawiesza się na "Saving registry.fly.io/clearkyc:cache..."

> Framing step before /ai-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

`flyctl deploy -a clearkyc --remote-only --verbose` (Paketo buildpacks build
przez zdalny builder Fly.io) kończy fazę `===> EXPORTING` (wszystkie warstwy
dodane poprawnie, w tym świeżo zbudowany frontend Angular skopiowany do
`src/main/resources/static`), po czym loguje `Saving registry.fly.io/clearkyc:cache...`
i tam się zatrzymuje. Proces `flyctl` przechodzi w stan praktycznie zerowego
zużycia CPU (<1%) i nie posuwa się dalej — obserwowane dwukrotnie pod rząd,
w tym samym dokładnie miejscu (pierwszy raz ~13+ min bez postępu, drugi raz,
po restarcie maszyny buildera, ~6,5+ min bez postępu).

## Initial Framing (preserved)

- **User's stated cause or approach**: (przeniesione z pamięci poprzedniej
  sesji, 1 lipca) "zdalny builder Fly.io jest zawieszony / w złym stanie";
  naprawą było zrestartowanie maszyny buildera.
- **User's proposed direction**: zabić zawieszony proces `flyctl deploy`,
  zrestartować maszynę buildera (`fly-builder-hidden-river-3155`), odpalić
  deploy ponownie.
- **Pre-dispatch narrowing**: użytkownik potwierdził, że to zawieszenie
  "zdarzało się już wcześniej, znane z pamięci sesji" (czyli nie jest to nowe
  zachowanie wywołane wyłącznie dołożeniem frontendu) — ale nie wie, czy
  builder jest współdzielony z innymi zadaniami na tym koncie.

## Dimension Map

1. **Maszyna buildera w złym stanie (stopped/suspended/brak zasobów)** —
   założenie użytkownika: restart maszyny naprawia sytuację trwale.
2. **Mechanizm cache'owania obrazu w Depot (backend `flyctl`'a do budowy)** —
   `flyctl` domyślnie używa Depot do budowy i zapisu warstw; krok "Saving
   registry.fly.io/...:cache" to zapis warstwy cache do rejestru przez Depot,
   niezależnie od tego, czy maszyna buildera jest "zdrowa".
3. **Sieć / auth do registry.fly.io** — token wygasły, throttling, lub
   przejściowy problem sieciowy między Depot a registry.fly.io.
4. **Rozmiar obrazu rosnący przez dodanie frontendu** — hipoteza, że nowe,
   większe warstwy (Angular bundle) powodują timeout przy pushu.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Maszyna buildera zawieszona/zatrzymana | `flyctl machine list -a fly-builder-hidden-river-3155` pokazał stan `started` przez cały czas, także PRZED pierwszym zawieszeniem (nie `stopped`, jak w incydencie z 1 lipca — tamten miał wyraźnie `stopped`/`suspended`). Restart maszyny wykonany, deploy odpalony ponownie — **zawiesił się w tym samym miejscu po ~6,5 min**, mimo "świeżej" maszyny. | NONE (restart nie usuwa objawu) |
| 2. Depot cache-save hang | Web search: wątek na community.fly.io "Stalling on Saving registry.fly.io cache" (https://community.fly.io/t/stalling-on-saving-registry-fly-io-cache/25071) opisuje dokładnie ten sam log-line i dokładnie ten sam objaw (zero progresu po "Saving ... cache"). Sugerowane obejścia: `flyctl deploy --no-cache`, `--depot=false`, `--recreate-builder`, lub przejście z buildpacks na jawny Dockerfile. `flyctl deploy --help` potwierdza istnienie tych flag (`--depot`, `--no-cache`, `--recreate-builder`) jako oficjalnych opcji do obejścia tego dokładnie kroku. | STRONG |
| 3. Sieć/auth do registry.fly.io | Brak bezpośrednich dowodów (SSH do buildera i sprawdzenie logów Depota zablokowane przez system uprawnień) — nie wykluczone jako czynnik pogłębiający, ale community-thread nie wskazuje na auth/network jako częstą przyczynę, tylko na sam mechanizm cache w Depot. | WEAK |
| 4. Rozmiar obrazu po dodaniu frontendu | Log pokazuje warstwy rzędu 85.2 MB (dependencies) + 22.8 MB (application) — to niewielki obraz jak na buildpacks (frontend jest już wbudowany w warstwę `application` jako część jara, nie osobna duża warstwa). Poprzedni incydent (1 lipca, wg pamięci sesji) zawieszał się też na etapie push, zanim frontend istniał w ogóle. | NONE |

## Narrowing Signals

- Restart maszyny buildera **nie zapobiegł** powtórnemu zawieszeniu w tym
  samym miejscu — to jest decydujący sygnał przeciwko hipotezie 1.
- Historia użytkownika ("zdarzało się już wcześniej") + community-thread
  opisujący identyczny log-line to zbieżny, niezależny sygnał na rzecz
  hipotezy 2.

## Cross-System Convention

Społeczność Fly.io konsekwentnie zgłasza ten sam problem przy budowach przez
buildpacks z Depot jako backendem i konsekwentnie obchodzi go flagami CLI
(`--no-cache`, `--depot=false`, `--recreate-builder`) zamiast restartu maszyny
buildera — restart maszyny to environment-level fix, a problem żyje w
warstwie cache/Depot, nie w samej maszynie.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: to nie jest awaria/zawieszenie
> maszyny buildera Fly.io, tylko znany, udokumentowany bug w mechanizmie
> zapisu cache obrazu przez Depot podczas buildów Paketo buildpacks na
> `flyctl deploy --remote-only`. Restart maszyny buildera leczy objaw
> przypadkiem (czasem "odblokowuje" kolejkę), ale nie adresuje przyczyny —
> stąd powtarzalne zawieszanie się w dokładnie tym samym miejscu.

Gdyby to było zaadresowane właściwą flagą (`--no-cache` / `--depot=false` /
`--recreate-builder`), deploy powinien przejść bez czekania kilkunastu minut
na kolejny "może się uda" restart. To też wyjaśnia, dlaczego pierwszy raz
"zadziałało" (być może przypadkowo ominięty stan cache) i dlaczego problem
wrócił identycznie po drugim uruchomieniu.

## Confidence

- **HIGH** — silny, niezależny dowód (community thread z identycznym
  log-line'em i oficjalnymi flagami CLI jako obejściem), zgodny z
  obserwacją "restart maszyny nie pomógł za drugim razem", i confirmed przez
  dostępność dedykowanych flag w `flyctl deploy --help`.

## What Changes for /ai-plan

Nie trzeba pełnego /ai-plan — to jest operacyjne obejście (flaga CLI), nie
zmiana kodu. Następny krok to odpalić `flyctl deploy -a clearkyc --remote-only
--no-cache` (lub `--depot=false` / `--recreate-builder` jako alternatywy w
razie niepowodzenia), zamiast kolejnego cyklu "zabij proces + restart
maszyny + spróbuj ponownie" bez flag.

## References

- Source files: `fly.toml`, `pom.xml` (`frontend-maven-plugin` config)
- Community evidence: https://community.fly.io/t/stalling-on-saving-registry-fly-io-cache/25071
- `flyctl deploy --help` output: `--depot`, `--no-cache`, `--recreate-builder`
- Deploy logs: `tasks/b6zdmserx.output`, `tasks/bmpmpu0np.output` (this session)
