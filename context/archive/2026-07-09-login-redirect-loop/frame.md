# Frame Brief: Login bounces back to landing on first attempt

> Framing step before /ai-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Po zalogowaniu (klikając "zaloguj się" na landing page) użytkownik zamiast trafić
do systemu (`cases/new`) wraca na landing page i musi kliknąć "zaloguj się"
ponownie. Występuje **zawsze** przy pierwszej próbie w danej sesji przeglądarki;
druga próba **zawsze się udaje** i użytkownik zostaje w systemie na stałe (nie ma
powtarzającej się pętli).

## Initial Framing (preserved)

- **User's stated cause or approach**: nie wskazano konkretnej przyczyny — opisano
  tylko efekt ("zamiast kierować do systemu, wracam na landing").
- **User's proposed direction**: nie wskazano konkretnego podejścia — chciał
  naprawy przekierowania po loginie.
- **Pre-dispatch narrowing**: obserwacja jednoznaczna po doprecyzowaniu —
  problem występuje za każdym razem (nie sporadycznie), a drugie kliknięcie
  zawsze rozwiązuje problem trwale (nie jest to pętla powtarzająca się w
  nieskończoność). Użytkownik nie był pewien, czy przez chwilę widać treść
  systemu przed powrotem na landing.

## Dimension Map

1. **Auth0 callback processing timing** — `AuthService` (auth0-angular) przetwarza
   `code`/`state` z URL w swoim konstruktorze; jeśli serwis nie zostanie
   skonstruowany zanim URL zostanie "skonsumowany", callback nigdy się nie wykona. ← okazało się główną przyczyną
2. **Route guard logic** (`auth.guard.ts`) — czy guard poprawnie czeka na
   `isLoading$`/`isAuthenticated$` przed decyzją.
3. **Redirect URI / routing po powrocie z Auth0** — czy trasa root (`''`) jest
   chroniona i czy dociera do niej cokolwiek, co wymusza obsługę callbacku.
4. **Token storage / persistence** (localStorage vs in-memory) — czy token z
   pierwszej próby w ogóle się zapisuje.
5. **Regresja z poprzedniej zmiany** `post-login-redirect` (`appState.target`
   dodany w `auth.guard.ts:18`) — czy fix był niekompletny.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Auth0 callback nigdy się nie przetwarza przy powrocie z Auth0, bo `AuthService` nie jest wstrzyknięty nigdzie na ścieżce root route | `web/src/app/app.config.ts:24-35` (redirect_uri = `window.location.origin`, czyli root `/`), `web/src/app/app.routes.ts:16-19` (root route `''` bez `canActivate`), `web/src/app/features/landing/landing.component.ts` (nie wstrzykuje `AuthService`), `web/src/app/core/guards/auth.guard.ts:11` (jedyne miejsce w apce, gdzie `AuthService` jest wstrzykiwany) | **STRONG** |
| Guard nie czeka poprawnie na `isLoading$`/`isAuthenticated$` | `auth.guard.ts:12-16` poprawnie łańcuchuje `isLoading$` → `isAuthenticated$` przez `filter`/`switchMap` | **NONE** |
| Token się nie zapisuje trwale | Druga próba zawsze się udaje i zostaje trwale — token/sesja działają poprawnie, gdy `AuthService` w ogóle zostanie skonstruowany | **NONE** |
| Regresja niekompletnego fixu z `post-login-redirect` | Fix (`appState: { target: 'cases/new' }`, `auth.guard.ts:18`) działa poprawnie *tylko jeśli* `AuthService` zostanie skonstruowany zanim `code`/`state` znikną z URL — commit `9929abe` zakładał to bez zabezpieczenia | **STRONG** (przyczyna pośrednia — fix był niekompletny, nie błędny) |

## Narrowing Signals

- "Zawsze przy pierwszej próbie" + "drugie kliknięcie zawsze działa trwale, bez pętli" —
  to jest podpis klasycznego "kod/state w URL nieprzetworzone przy pierwszym
  załadowaniu, przetworzone przy drugim", a nie flaky race condition ani problem
  z sesją/tokenem.
- Bezpośrednia lektura kodu potwierdza mechanizm 1:1: pierwsze kliknięcie
  "zaloguj się" → `router.navigate(['cases/new'])` (client-side, `AuthService`
  jeszcze nie istnieje) → `authGuard` konstruuje `AuthService` po raz pierwszy →
  `isAuthenticated$` = false → `loginWithRedirect` → pełne przekierowanie do
  Auth0 → Auth0 wraca pełnym reloadem na `redirect_uri` = `window.location.origin`
  (czyli `/`, root route) → root route jest **nieustrzeżony** i renderuje
  `LandingComponent`, która nigdy nie wstrzykuje `AuthService` → `code`/`state`
  zostają nieprzetworzone w URL, landing page się po prostu wyświetla.
  Drugie kliknięcie "zaloguj się" → znowu `router.navigate(['cases/new'])` →
  `authGuard` **po raz pierwszy w tym załadowaniu strony** konstruuje
  `AuthService` → konstruktor widzi wciąż obecny w URL `code`/`state` →
  przetwarza callback → `handleRedirectCallback` nawiguje do `appState.target`
  = `cases/new`.

## Cross-System Convention

Standardowy wzorzec auth0-angular / Auth0 SPA SDK wymaga albo: (a) eager
inicjalizacji `AuthService` na starcie aplikacji (np. `APP_INITIALIZER` /
`provideAppInitializer` wołający `authService.isAuthenticated$` raz), albo
(b) dedykowanej, jawnie chronionej trasy `/callback` jako `redirect_uri`
zamiast surowego `window.location.origin`, tak by callback zawsze trafiał w
miejsce, które konstruuje `AuthService`. Obecna konfiguracja (`redirect_uri:
window.location.origin` wskazujący na nieustrzeżony root) nie odpowiada temu
konwencjonalnemu wzorcowi — stąd zależność od przypadkowego pierwszego
wstrzyknięcia `AuthService` przez guard.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: Auth0 SPA callback (`code`/`state`
> w URL po powrocie z logowania) nigdy nie jest przetwarzany przy pierwszym
> ładowaniu strony, bo `redirect_uri` wskazuje na nieustrzeżoną trasę root,
> a `AuthService` (auth0-angular) nie jest konstruowany nigdzie na tej ścieżce —
> callback przetwarza się dopiero przy przypadkowym, kolejnym wywołaniu guarda.

To nie jest problem "przekierowania po loginie" w sensie z poprzedniej zmiany
(`post-login-redirect` — dokąd nawigować po sukcesie) — ten element już działa
poprawnie, gdy callback w ogóle się wykona. Prawdziwy problem leży wcześniej:
sam callback od Auth0 nie ma gwarantowanego miejsca w aplikacji, które go
przetworzy przy pierwszym powrocie. Poprawka wymaga zapewnienia, że
`AuthService` zostanie skonstruowany (i przez to przetworzy `code`/`state`)
zanim root route wyrenderuje landing — niezależnie od tego, czy user kliknie
raz czy dwa razy.

## Confidence

**HIGH** — silny dowód z bezpośredniej lektury kodu (`app.config.ts`,
`app.routes.ts`, `landing.component.ts`, `auth.guard.ts`, plus wewnętrzna
logika `@auth0/auth0-angular`), zgodny z konwencją SDK (potrzebny eager init
albo dedykowany `/callback`), i w pełni wyjaśniający zaobserwowany sygnał
("zawsze pierwszy raz, zawsze drugi raz działa trwale").

## What Changes for /ai-plan

Plan powinien dotyczyć zapewnienia, że Auth0 callback (`code`/`state`) jest
przetwarzany deterministycznie przy powrocie z logowania — np. przez eager
inicjalizację `AuthService` w bootstrapie (`APP_INITIALIZER`/
`provideAppInitializer`) albo przez dedykowaną, jawnie obsługiwaną trasę
`/callback` jako `redirect_uri` — a nie o samą logikę "dokąd nawigować po
zalogowaniu" (to już działa poprawnie dzięki poprzedniej zmianie).

## References

- Source files:
  - `web/src/app/app.config.ts:24-35`
  - `web/src/app/app.routes.ts:16-19`
  - `web/src/app/features/landing/landing.component.ts:29-31`
  - `web/src/app/core/guards/auth.guard.ts:7-24`
  - `web/node_modules/@auth0/auth0-angular/fesm2022/auth0-auth0-angular.mjs:186-197,301-311,514-532,597-606`
- Related change: `context/changes/post-login-redirect/plan.md` (commit `9929abe`)
