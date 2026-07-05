# Territory Map - Artifact 1: Git Activity Analysis

Generated: 2026-06-22. Source: `git log` full history (project started 2026-05-20, 89 commits).
Poprzednia wersja: 2026-06-08 (26 commits). Dane ponizej zastepuja tamten snapshot.

---

## Najczesciej modyfikowane foldery (all-time, odfiltrowany szum)

| # | Folder | Zmiany |
|---|--------|--------|
| 1 | `web/src/app/features/case-detail/components/extraction-form` | 26 |
| 2 | `web/src/app/features/case-detail` | 24 |
| 3 | `web/src/app/shared/components/decision-bar` | 19 |
| 4 | `web/src/app/shared/components/pdf-viewer` | 15 |
| 5 | `web/src/app/layout/app-layout` | 14 |
| 6 | `web/src/app/features/case-new` | 14 |
| 7 | `src/main/resources` | 14 |
| 8 | `src/main/java/.../web/dto` | 13 |
| 9 | `src/main/java/.../analysis` | 13 |
| 10 | `src/main/java/.../service` | 12 |

## Najczesciej modyfikowane pliki (all-time)

| # | Plik | Zmiany |
|---|------|--------|
| 1 | `web/.../case-detail/case-detail.component.ts` | 11 |
| 2 | `web/.../extraction-form/extraction-form.component.html` | 10 |
| 3 | `src/main/resources/application.properties` | 10 |
| 4 | `web/.../case-detail/case-detail.component.html` | 9 |
| 5 | `pom.xml` | 9 |
| 6 | `web/.../extraction-form/extraction-form.component.ts` | 7 |
| 7 | `web/.../extraction-form/extraction-form.component.scss` | 7 |
| 8 | `web/.../pdf-viewer/pdf-viewer.component.ts` | 6 |
| 9 | `web/.../decision-bar/decision-bar.component.ts` | 6 |
| 10 | `web/.../decision-bar/decision-bar.component.html` | 6 |

Centrum aktywnosci: `case-detail` z `extraction-form` to 5 z 10 najgorzejszych plikow. Backend (`CaseController`, `FinalizeService`, `CaseService`) po 6 zmian kazdy - tuz za nimi.

---

## Ewolucja nacisku pracy - tygodniowo

```
W1  20-25 maj   |##                   | Bootstrap / infra
W2  26 maj-1 cz |####################| Core fullstack (peak)
W3   2-8 cze    |##########           | Testy + integracja BE
W4   9-15 cze   |                     | Przerwa (zero commitow)
W5  16-22 cze   |###############      | UI polish / UX
```

**W1 (bootstrap):** `application.properties`, `pom.xml`, `fly-deploy.yml`. Projekt wychodzi z Initializr.

**W2 (peak - najbardziej intensywny):** jednoczesnie `case-detail` (14), `web/dto` (10), `analysis` (10), `extraction-form` (9), `pdf-viewer` (8). Backend i frontend rosna rownolegle. `FinalizeService.java` (6 zmian), `case-detail.component.ts` (7 zmian).

**W3 (testy + integracja):** `decision-bar` (5), `extraction-form` (5), pliki `.spec.ts`. `CaseController.java` i `CaseService.java` po 3 zmiany. Testy pisano wspolbieznie z kodem produkcyjnym.

**W4:** Brak commitow.

**W5 (UI polish - biezacy tydzien):** `extraction-form` (12), `decision-bar` (8), `onboarding-overlay` (7). Same szablony HTML i SCSS - zero nowych ficzorow backendowych. Onboarding overlay pojawia sie po raz pierwszy.

---

## Sprzezenia co-change (pary i trojki katalogow)

### Top pary (liczba wspolnych commitow)

| Commits | Para katalogow |
|---------|----------------|
| 8 | `extraction-form` + `decision-bar` |
| 7 | `service` + `web` (controllers) |
| 6 | `service` + `src/test/.../web` |
| 6 | `service` + `web/dto` |
| 5 | `extraction-form` + `citation-badge` |
| 5 | `citation-badge` + `decision-bar` |
| 5 | `web` + `src/test/.../web` |
| 5 | `case-detail` + `pdf-viewer` |

### Top trojki

| Commits | Trojka |
|---------|--------|
| 5 | `extraction-form` + `citation-badge` + `decision-bar` |
| 5 | `service` + `web` + `src/test/.../web` |
| 4 | `service` + `web` + `web/dto` |
| 4 | `service` + `web/dto` + `src/test/.../web` |
| 3 | `extraction-form` + `red-flag-list` + `decision-bar` |

### Wnioski ze sprzezen

**`extraction-form` / `decision-bar` / `citation-badge` (8 wspolnych commitow, trojka 5x):** jeden logiczny modul analityczny rozbity na trzy katalogi. Zmiana w logice ekstrakcji pola niemal zawsze pociaga zmiane w layoucie decyzji i sposobie wyswietlania cytowania. Nalezy traktowac jako jedna jednostke przy refactoringu.

**`service` + `web` + `web/dto` (trojka 4x):** backend rusza sie w triptyku - kontroler, serwis i DTO w jednym atomowym commicie. Testy kontrolera (`src/test/.../web`) chodza razem z implementacja (6 wspolnych commitow), nie po fakcie. Zdrowy sygnal architektury.

**`case-new` + `decision-bar` + `file-dropzone` (3-4 wspolnych commitow):** `case-new` sprzezone z widokiem workstacji - prawdopodobnie wspoldzielony serwis albo DTO po stronie frontu. Kandydat do obserwacji - jesli sprzezenie rosnie, nalezy wydzielic wspolny serwis.

---

## Wspolny mianownik repo (fan-out per plik)

Pliki wspolzmieniajace sie z najwieksza liczba roznych katalogow:

| Roznych katalogow | Plik | Charakter |
|-------------------|------|-----------|
| 27 | `src/main/resources/application.properties` | config-tax - naturalny, logika zerowa |
| 27 | `web/package.json` | config-tax - naturalny, logika zerowa |
| 26 | `extraction-form.component.html` | realny hub UI |
| 26 | `case-new.component.html` | realny hub UI |
| 25 | `web/src/app/core/services/case.service.ts` | **prawdziwy hub aplikacyjny** |
| 24 | `case-detail.component.ts` | centrum widoku workstacji |
| 24 | `web/src/app/app.routes.ts` | routing - naturalny |
| 22 | `pom.xml` | config-tax BE |

`application.properties` i `web/package.json` to szum konfiguracyjny - wysoki fan-out wynika z tego, ze kazda nowa funkcja dokłada wpis, nie ze zlej architektury.

**`web/src/app/core/services/case.service.ts` (25 katalogow)** - jedyny plik aplikacyjny z naprawde szerokim sprzezeniem semantycznym. Serwis HTTP komunikuje sie z backendem i zmienil sie razem z 25 roznymi katalogami, bo kazda zmiana kontraktu API pociagala poprawke tutaj. To pierwsze miejsce, ktore zacznie bolec przy rozroscie API.

---

## Weryfikacja istnienia (2026-06-22)

Wszystkie 12 katalogow i 10 plikow z analizy sprzezen sa aktywne w HEAD. Zero "duchow".

Katalogi OK: `extraction-form`, `decision-bar`, `citation-badge`, `service`, `web` (controllers), `web/dto`, `case-new`, `file-dropzone`, `case-detail`, `pdf-viewer`, `onboarding-overlay`, `app-layout`.

Pliki OK: `case-detail.component.ts/html`, `extraction-form.component.html/ts`, `decision-bar.component.ts/html`, `citation-badge.component.ts`, `FinalizeService.java`, `CaseService.java`, `CaseController.java`, `application.properties`.
