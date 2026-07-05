# Structure Map - Artifact 2: Dependency Analysis

Generated: 2026-06-22. Narzędzie: dependency-cruiser 17.4.3 + @hpcc-js/wasm-graphviz.
Zakres: `web/src/app` (40 modułów, 109 zależności). Backend poza zakresem (Java).

Powiązany plik graficzny: `context/map/store-hub.svg`

---

## Konfiguracja dependency-cruiser

Plik: `web/.dependency-cruiser.js`. Skrypty: `npm run depcruise` (CI), `npm run depcruise:graph` (SVG).

### Aktywne reguły

| Reguła | Severity | Stan |
|--------|----------|------|
| `no-circular` | error | Czyste - 0 cykli |
| `no-shared-to-features` | error | Czyste |
| `no-core-to-features` | error | Czyste |
| `no-cross-feature` | warn | Czyste |
| `no-layout-to-features` | warn | Czyste |
| `not-to-dev` | error | Czyste |
| `no-orphans` | warn | 1 orphan: `pdf-storage.service.ts` |

### Brakujące reguły (do dodania)

```js
{ name: "no-feature-to-layout",             severity: "error" }  // case-detail importuje AppLayoutComponent
{ name: "no-shared-to-core-store-or-services", severity: "warn" } // shared/ zabetonowane domenowo
```

---

## Granice warstw - wyniki

Kierunek przepływu: `features → shared → core`. Zgodny wszędzie poza dwoma wyjątkami.

### Naruszenie 1: `features → layout` (nie wychwycone przez reguły)

`case-detail.component.ts` importuje `AppLayoutComponent` bezpośrednio jako komponent Angular zamiast korzystać z wrappera routerowego. Jedyny import tej pary w całym repo.

**Konsekwencja:** zmiana shell-a (nawigacja, sidebar, struktura `<ng-content>`) musi być koordynowana z logikiem widoku analityka. `case-detail` to plik #1 churn (11 zmian); `app-layout` folder #5 (14 zmian).

### Naruszenie 2: `shared → core/store` i `shared → core/services` (ukryty problem)

`decision-bar`, `citation-badge`, `pdf-viewer` importują `case.store.ts` i/lub `extraction.models.ts` bezpośrednio. Nie są reużywalnymi komponentami - są komponentami domenowymi KYB umieszczonymi w `shared/`.

**Konsekwencja:** zmiana schematu stanu (nowe pole, rename) propaguje do komponentów oznaczonych jako "wspólne".

### Co jest czyste

- Żaden moduł `core/` nie importuje z `features/` - warstwa fundamentu jest nienaruszona.
- Żaden moduł `shared/` nie importuje z `features/` - reguła aktywna i skuteczna.
- Brak cykli w całym grafie.

---

## Metryki stabilności (wybrane moduły)

Format: `Ca` = ile modułów importuje ten plik | `Ce` = ile modułów ten plik importuje | `I` = Ce/(Ca+Ce).

| Moduł | Ca | Ce | I | Churn (territory map) | Ocena |
|-------|----|----|---|----------------------|-------|
| `case-detail.component.ts` | 1 | 12 | 92% | #1 (11 zmian) | Krytyczny - bardzo niestabilny i intensywnie zmieniany |
| `extraction-form.component.ts` | 1 | 8 | 80% | folder #1 (26 zmian) | Krytyczny - streaming + store + operators |
| `case-new.component.ts` | 1 | 8 | 89% | folder #6 (14 zmian) | Wysoki - router + HTTP + upload |
| `decision-bar.component.ts` | 1 | 5 | 71% | folder #3 (19 zmian) | Wysoki - terminalna akcja biznesowa |
| `case.store.ts` | **6** | 2 | 25% | (hub ukryty w core/) | Stabilny sam w sobie, krytyczny jako infrastruktura testowa |
| `extraction.models.ts` | **8** | 0 | 0% | (hub ukryty w core/) | Bardzo stabilny - tylko typy, Ca=8 to oczekiwane |
| `case.service.ts` | 2 | 4 | 67% | hub aplikacyjny (25 co-change) | Zdrowy - standardowy serwis HTTP |
| `extraction-stream.service.ts` | 1 | 5 | 63% | - | Ryzyko: Auth0 + SSE trudne do mockowania |

---

## Ukryty hub: `case.store.ts` (Ca=6)

Główne odkrycie sesji. Store jest importowany przez 6 modułów z 2 różnych warstw:

- **features:** `case-detail`, `extraction-form`, `red-flag-list`, `case-new`
- **shared:** `decision-bar`, `citation-badge`

To jest rzeczywista przyczyna co-change klastra `extraction-form + decision-bar + citation-badge` (5 wspólnych commitów wg mapy terytorium). Każda zmiana kształtu stanu store wymusza synchroniczną aktualizację wszystkich 6 konsumentów.

Projekt posiada `core/testing/case-store.mock.ts` - mock istnieje, ale jest używany tylko w 3 spec-ach przy 6 modułach produkcyjnych.

Graf: `context/map/store-hub.svg`

---

## Ryzyka testowalności

### Klasyfikacja modułów

| Moduł | Poziom ryzyka | Główna przyczyna | Strategia |
|-------|---------------|-----------------|-----------|
| `case-detail.component.ts` | Bardzo wysoki | Ce=12, 9+ mocków | Integration TestBed + E2E |
| `extraction-form.component.ts` | Wysoki | SSE streaming + Auth0 + store + rxjs operators | Unit (logika RxJS) + Integration + E2E |
| `extraction-stream.service.ts` | Wysoki | Auth0 SDK + SSE (nie HttpClient) + environment.ts | Mock całego serwisu jako Observable w konsumencie |
| `case-new.component.ts` | Umiarkowany-wysoki | Router + upload pliku (drag-and-drop) | Unit (walidacja) + E2E (upload flow) |
| `decision-bar.component.ts` | Umiarkowany | Store + decision.service, terminalna akcja | Unit (logika + błędy) + E2E (potwierdzenie) |
| `citation-badge.component.ts` | Niski-umiarkowany | Ca=2, store dependency | Unit z mock store |
| `case.service.ts` | Niski | Standardowy HttpClient service | Unit z HttpTestingController |
| `case.store.ts` | Niski (sam) / Wysoki (jako infrastruktura) | Ca=6 - każdy test konsumenta zależy od spójnego stanu | Rozszerzyć zakres `case-store.mock.ts` |

### Specyficzne ryzyka SSE i Auth0

`extraction-stream.service.ts` używa `@auth0/auth0-angular` (brak lekkiego mocka) i SSE przez RxJS (nie `HttpClient` - poza zasięgiem `HttpTestingController`). Jedyna zależność w projekcie wymagająca niestandardowej infrastruktury testowej.

Rekomendacja: testować serwis przez jego publiczny kontrakt Observable, nie przez mockowanie SSE/EventSource.

---

## Plik graficzny

`context/map/store-hub.svg` - 30 KB, poprawny SVG.

Pytanie na które odpowiada: *dlaczego extraction-form, decision-bar i citation-badge zmieniają się razem?*

Zakres: 14 węzłów produkcyjnych (bez spec-ów), 3 warstwy (core/shared/features), kolorowanie per warstwa.
Generowanie: `node web/scripts/render-store-hub.mjs`
Skrypt źródłowy: `web/scripts/render-store-hub.mjs`
