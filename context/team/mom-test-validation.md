# Mom Test Validation Plan

## Input Idea

CLAUDE config sync checker - narzedzie porownujace konfiguracje AI (skills, CLAUDE.md, .claude/settings.json)
miedzy "seed repo" a biezacym projektem.

**Korekta po rozmowie:** Wlasciwa potrzeba jest szersza - programista chce wlasnego workflow AI
wzorowanego na 10x, ale dostosowanego do siebie. Nie chodzi o sync jako cel, lecz o posiadanie
wlasnego toolkitu jako first-class artifact: zestaw skills, regul i CLAUDE.md, ktory mozna rozwijac
i przenosic miedzy projektami.

## Hypotheses

- **User/rola**: Programista pracujacy rownolegla na kilku projektach z 10xDevs AI toolkit.
- **Friction**: Konfiguracja AI kopiowana recznie miedzy projektami, projekty dryfuja osobno.
  Prawdziwy bol: brak wlasnego, ewolucyjnego workflow AI, ktory nalezy do programisty, nie do projektu.
- **Current workaround**: Brak narzedzia - reczne cp/diff, ignorowanie dryfu albo tworzenie od zera.
- **Risky assumptions**:
  1. Programista faktycznie pracuje na kilku projektach rownoczesnie.
  2. Dryf konfiguracji jest problemem, a nie pozadana lokalna adaptacja.
  3. Koszt synchronizacji uzasadnia kolejne narzedzie.
  4. Istnieje "seed repo" - zrodlo prawdy - ktore programista chce utrzymywac.
  5. Programista wie, co to jest aktualizacja wzorca, a co to lokalna adaptacja.
- **Evidence already present**: Brak wywiadow, brak danych. Sygnal pochodzi z wewnetrznej refleksji.
  Mocny sygnal uzytkownika podczas Mom Test: "chce swojego narzedzia, swojego workflow".

## Critique

Propozycja sync checkera mylila rozwiazanie z problemem. Pytanie o "narzedzie do syncu"
zakladalo, ze problem to niezsynchronizowane pliki. Prawdziwy problem to brak wlasnosci
i ewoluowalnosci konfiguracji AI - toolkit jest gdzies w projekcie, a nie u programisty.

To rozroznienie ma konsekwencje dla ksztaltu rozwiazania:
- Sync checker: reaktywny, naprawia dryf ktory juz nastapil.
- Wlasny toolkit: proaktywny, programista definiuje wzorzec i przenosi go do projektu.

Slabe punkty hipotezy, ktore wymagaja sprawdzenia:
- Czy "wlasny workflow" oznacza nowe narzedzie, czy wystarczy konwencja folderow + bootstrapper?
- Czy bol jest w tworzeniu toolkit (setup raz), czy w utrzymaniu go aktualnym (ciagle)?
- Co jest zrodlem prawdy - ~/.claude/ globalny, dedykowany repo, czy npm package?

## Interview Guide

### Kontekst (5 min)

1. Ile projektow z konfiguracja Claude Code (pliki .claude/, CLAUDE.md, skills) masz aktualnie aktywnych?
   Jak czesto sie miedzy nimi przełaczasz?
2. Opisz swoj typowy workflow, gdy zaczynasz nowy projekt - skad bierzesz konfiguracje AI?

### Ostatnie zdarzenie (8 min)

3. Kiedy ostatnio zauwazyłes, ze konfiguracja AI rozni sie miedzy projektami?
   Co to byly za projekty?
4. Co dokladnie sie stalo - jak to odkryłes? Szukałes aktywnie, czy sie na to natknąłes?
5. Co zrobiłes z ta roznica? (follow-up: Ile czasu Ci to zajelo?)

### Aktualne obejscie (7 min)

6. Jesli chcesz miec ten sam skill w dwoch projektach, jak teraz to robisz?
7. Czy zdarzalo Ci sie, ze skill dzialal inaczej w roznych projektach i musiales przez to debugowac?
   Opisz konkretna sytuacje.
8. Jak dzis sprawdzasz, czy konfiguracja w projekcie jest "aktualna"?
   (follow-up: Czy w ogole to sprawdzasz?)

### Koszt tarcia (5 min)

9. Czy dryf konfiguracji miedzy projektami kiedykolwiek spowodowal u Ciebie blad, strate czasu
   lub koniecznosc cofniecia sie? Opisz to.
10. Co jest bardziej frustrujace - konfiguracja nieaktualna, czy konfiguracja niespójna z innymi
    ludzmi na zespole?

### Istniejace alternatywy (3 min)

11. Czy probowalas juz czegos, zeby ten problem rozwiazac - git submodules, skrypty, monorepo,
    cos innego?
12. Gdyby to narzedzie nie istnialo nigdy, co bysbyc robil zamiast tego?

### Zamkniecie

13. Czy moge wrocic do Ciebie z mockupem i sprawdzic, czy rozwiazuje wlasciwy problem?

## Survey

**Q1 (screener).** Ile projektow z konfiguracja Claude Code (.claude/, CLAUDE.md, skills) masz aktywnych?
- [ ] 1 projekt (biezacy)
- [ ] 2-3 projekty
- [ ] 4 lub wiecej
- [ ] Nie uzywam Claude Code z konfiguracja per-projekt

**Q2.** Jak czesto zdarzaz Ci sie odkryc, ze skill lub regula jest inna w roznych projektach?
- [ ] Nigdy tego nie sprawdzam
- [ ] Rzadko (raz na kilka miesiecy)
- [ ] Czasami (raz w miesiacu)
- [ ] Czesto (co tydzien lub czesciej)

**Q3.** Jak konfigurujesz nowy projekt AI - skad bierzesz skills i CLAUDE.md?
- [ ] Tworze od zera dla kazdego projektu
- [ ] Kopiuje recznie z innego projektu
- [ ] Mam wlasny skrypt lub szablon
- [ ] Uzywam 10x-bootstrapper lub podobnego narzedzia

**Q4.** Kiedy ostatnio nastapil dryf konfiguracji (stara/inna wersja), ile czasu Ci to zabralo zanim to naprawiłes?
- [ ] Nie pamietam takiej sytuacji
- [ ] Kilka minut
- [ ] Pol godziny do godziny
- [ ] Kilka godzin lub wiecej

**Q5.** Co jest bardziej bolesne w Twoim codziennym workflow?
- [ ] Dryf konfiguracji AI miedzy moimi projektami
- [ ] Nieaktualne CI/CD lub brak pokrycia testow
- [ ] Brak widocznosci statusu roadmapy
- [ ] Inne

**Q6 (otwarty).** Opisz konkretna sytuacje, gdy stara lub nieaktualna konfiguracja AI spowodowala u Ciebie problem. Co sie stalo?

**Q7 (otwarty).** Jak dzis radzisz sobie z utrzymaniem spojnosci konfiguracji AI miedzy projektami? Czego Ci brakuje?

## Decision Criteria

- **Proceed**: Co najmniej 3 z 5 rozmowcow opisuje konkretna sytuacje (bez naprowadzenia),
  gdzie dryf spowodowal strate czasu, blad lub frustracje. LUB uzytkownik opisuje swoj wlasny
  toolkit jako cos, co chce posiadac i rozwijac - co potwierdzone przez Mom Test w tej sesji.
- **Narrow scope**: Bol dotyczy glownie onboardingu nowych projektow (nie biezacego dryfu) -
  wtedy zakres to "bootstrap sync", nie "ongoing monitor".
- **Do not build yet**: Wiekszosc respondentow Q4 = "Nie pamietam" lub Q2 = "Nigdy".
  Dryf jest traktowany jako pozadana lokalna adaptacja.
- **Try existing tool/process first**: Jesli `diff -r ~/.claude/ ./.claude/` w terminalu wystarcza -
  skill jest nadmiarowym opakowaniem. Udostepnic ten oneliner zamiast budowac.

## Status

Walidacja wstepna zakonczona. Sygnal wystarczajacy do przejscia do /10x-shape.
Nastepny krok: uformowac ksztalt "wlasnego AI toolkit" jako produktu/narzedzia.
