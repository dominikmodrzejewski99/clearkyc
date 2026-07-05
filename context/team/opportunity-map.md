# Opportunity Map

## Context

- **Project / context**: ClearKYC - wewnetrzny toolkit 10xDevs / konfiguracja AI
- **Data constraint**: local repo + context/ files + GitHub API (read-only, non-sensitive)
- **Date**: 2026-06-25

## Map

| Sygnal | Existing / default response | Thin complement | First useful version | Data risk | Direction if valuable |
|---|---|---|---|---|---|
| Nie wiem, jaki jest status roadmapy | context/changes/ change.md + 10x-health-check | skill digest z context/ | read-only skan -> markdown summary | local | Team agent / rozbudowa 10x-health-check |
| Chce wiedziec pokrycie kodu | ng test --code-coverage + JaCoCo (oba istnieja, manual) | skrypt "odpal i podsumuj" | parse output -> liczby w czacie | local | Review / CI gate |
| Nie wiem czy CI dziala | GitHub Actions tab + gh run list | gh + status digest | ostatnie 5 runow, wyniki per branch | local + GitHub API | Async monitor przed deploy |
| Skille i CLAUDE.md kopiowane recznie miedzy projektami | brak narzedzia | diff vs seed repo / katalog wzorcowy | "co sie rozni?" report - lista plikow do aktualizacji | local | Shared artifact registry |

## Recommended First Candidate

```
Candidate:
  CLAUDE config sync checker

Reads:
  Jeden lokalny "seed repo" (lub ~/.claude/skills/)
  vs. docelowy projekt (.claude/skills/, CLAUDE.md, .claude/settings.json)

Returns:
  Raport diffow: "te pliki sa nieaktualne", "tych brakuje", "te sa dodatkowe"
  Opcjonalnie: lista polecen cp do wykonania

Does not do:
  Nie pushuje, nie commituje, nie zarzadza wersjami, nie instaluje globalnie

Data risk:
  local / read-only - czyta pliki, nie pisze bez zgody

Direction if valuable:
  Shared artifact registry -> wspolny pakiet npm lub git submodule
  ze standardowym zestawem skills dla wszystkich projektow 10xDevs
```

## Why This Candidate

Pozostale trzy sygnaly dotycza widocznosci w jednym projekcie i maja juz istniejace odpowiedzi
(health-check, gh CLI, ng coverage). Signal 4 jest jedynym, ktory uderza w kazdy nowy projekt
z zewnatrz i nie ma zadnego narzedzia dzisiaj. Brak narzedzia tu oznacza, ze kazdy projekt
dryfuje osobno - nieaktualne skills, niespojne konfiguracje. Koszt startu: jeden skrypt lub
skill, dane lokalne, zero ryzyka danych.

## Next Direction If Valuable

**Shared artifact registry** - centralny pakiet lub git submodule z zestawem skills/rules/CLAUDE.md
dla wszystkich projektow 10xDevs. Moze ewoluowac w kierunku 10x-bootstrapper albo dedykowanego
npm package z wersjonowaniem.

## Next Step

Wybrany: **Validate, potem shape** - /10x-mom-test -> /10x-shape
Cel walidacji: sprawdzic czy problem "kopiowania konfiguracji miedzy projektami" jest realny i
czy proponowane rozwiazanie (sync checker) trafi w sedno bolu.
