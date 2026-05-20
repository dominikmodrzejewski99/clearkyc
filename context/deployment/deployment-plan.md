# Pierwsze wdrożenie ClearKYC na Fly.io — smoke deploy

## Kontekst

Repo jest w stanie bare Spring Initializr (pom.xml: tylko `spring-boot-starter-webmvc` + `devtools` + test starter; jedyna klasa to `ClearkycApplication.java`; `application.properties` ma jedną linię). Decyzje już zapadły i są zapisane w foundation:

- **`context/foundation/tech-stack.md`** — Spring Boot 4.0.6 + Java 21 + Maven Wrapper, deployment target `fly`, CI `github-actions` z `auto-deploy-on-merge`.
- **`context/foundation/infrastructure.md`** — rekomendacja: Fly.io (app compute) + CockroachDB Serverless Free, `BP_JVM_VERSION=21`, `auto_stop_machines="off"` + `min_machines_running=1`, region `fra` (lub `waw` dla PL-rezydencji), Paketo buildpack, koszt ~$2–3/mo.

Cel: **postawić żywą instancję Spring Boot na Fly.io w regionie `fra`** zanim do repo dojdzie warstwa danych (JPA/CockroachDB), SSE, auth czy LLM. Walidujemy pipeline (Paketo + Java 21 + EU region + secrets pipeline + health check) na minimalnej powierzchni — kolejne PR-y dokładają warstwy (DB → JSON Schema → SSE → auth → LLM) na sprawdzonej infrze.

Decyzje zatwierdzone w trakcie planowania:
- **zakres = minimalny smoke-deploy bez DB**
- **region = `fra`**

## Braki w "Getting Started" infrastructure.md, które plan naprawia

Sekcja `Getting Started` w `infrastructure.md` opisuje pełną ścieżkę z CockroachDB w kroku 3 i JPA deps w kroku 5 — jako "pierwsze wdrożenie" to za dużo. Plan dodatkowo łata:

1. **Brak Spring Boot Actuator** — Fly proxy potrzebuje health-checka do uznania maszyny za "ready". `infrastructure.md` o tym nie wspomina. Dodajemy `spring-boot-starter-actuator` i wystawiamy `/actuator/health` jako endpoint dla `[[http_service.checks]]` w `fly.toml`.
2. **Brak `[[http_service.checks]]` w przykładowym `fly.toml`** w infrastructure.md — Fly bez health-checka zakłada że maszyna jest gotowa od razu, co maskuje błędy startupu Spring Boota (8–15 s cold start). Plan dorzuca check na `/actuator/health` z `grace_period = "30s"`.
3. **Niejednoznaczność JDBC URL** — `infrastructure.md` krok 4 ustawia `DATABASE_URL` jako sekret, ale Spring Boot oczekuje `SPRING_DATASOURCE_URL`/`SPRING_DATASOURCE_USERNAME`/`SPRING_DATASOURCE_PASSWORD` lub własnego rozdzielonego URL-a; CockroachDB Cloud zwraca `postgresql://` nie `jdbc:postgresql://`. To problem **następnego** PR-a (gdy dojdzie DB) — wpis trafia do `Out of scope` z notatką dla przyszłego deploya DB.
4. **Brak weryfikacji unikalności nazwy app** — `clearkyc` w globalnej namespace Fly.io może być zajęte. Krok `flyctl apps create` przed `launch --no-deploy`, z fallbackiem na `clearkyc-pl`.
5. **Pomieszane warstwy: buildpack vs Dockerfile** — `flyctl launch` domyślnie generuje Dockerfile. Wymuszamy Paketo przez `--no-deploy` + ręczna edycja `fly.toml` `[build] builder = "paketobuildpacks/builder-jammy-base"`, usunięcie wygenerowanego Dockerfile.
6. **Brak konfiguracji ograniczenia ekspozycji Actuatora** — `/actuator/health` może wyciekać szczegóły. Dla smoke deploya OK domyślnie (zwraca tylko `{"status":"UP"}` bez `management.endpoint.health.show-details`), ale dodajemy jawnie `management.endpoints.web.exposure.include=health` w `application.properties` żeby nie eksponować przyszłych endpointów (`/env`, `/beans`, `/heapdump`) gdy Spring 4 dorzuca defaulty.
7. **Brak gate'u CLOUD Act / DPO** — `infrastructure.md` zaznacza ryzyko CLOUD Act dla polskiego pilota. Plan dokumentuje że smoke deploy nie zawiera danych klientów (żaden secret z PII, żadne DB), więc CLOUD-Act-conversation z DPO jest blokerem dla pierwszego pilota produkcyjnego, **nie** dla tego deploya. Notatka jako warning, nie blocker.
8. **Brak GitHub Actions** dla pierwszego deploya — zgodnie z wyborem zakresu, CI auto-deploy-on-merge wpinamy w **następnym** PR-ze. Pierwszy deploy = ręczny `flyctl deploy` z lokalnego CLI dewelopera. To celowo: walidacja pipeline'u zanim się go zautomatyzuje.

## Pliki, które plan tworzy/zmienia

- **NOWY** `fly.toml` (w root) — konfiguracja appki, region, builder, env, checks
- **ZMIANA** `pom.xml` — dodanie `spring-boot-starter-actuator`
- **ZMIANA** `src/main/resources/application.properties` — `management.endpoints.web.exposure.include=health`
- **ZMIANA** `.gitignore` — wpis `.fly/` (Fly CLI cache) i `fly.toml.bak`
- **NIE TWORZYMY** `Dockerfile` — Paketo buildpack go nie potrzebuje; jeśli `flyctl launch` wygeneruje, usuwamy.

## Plan wykonania

### Krok 1 — Instalacja i autoryzacja `flyctl`

```bash
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
flyctl version          # sanity check
flyctl auth login       # otwiera przeglądarkę
flyctl auth whoami      # potwierdza zalogowanie
```

Jeśli `flyctl` jest już zainstalowany — pomijamy install, robimy `flyctl version update`.

### Krok 2 — Dodanie Actuatora do `pom.xml`

Edycja `pom.xml`, dodanie do `<dependencies>`:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

W `src/main/resources/application.properties`:

```properties
spring.application.name=clearkyc
management.endpoints.web.exposure.include=health
management.endpoint.health.probes.enabled=true
```

Lokalna weryfikacja:

```bash
./mvnw spring-boot:run &
curl -s http://localhost:8080/actuator/health
# spodziewane: {"status":"UP"}
kill %1
```

### Krok 3 — Rezerwacja nazwy app na Fly.io

```bash
flyctl apps create clearkyc --org personal
# Jeśli zajęte → fallback:
# flyctl apps create clearkyc-pl --org personal
```

(Jeśli użytkownik ma org inną niż `personal`, podstawiamy. `flyctl orgs list` jeśli niepewne.)

### Krok 4 — Generacja `fly.toml` przez `flyctl launch --no-deploy`

```bash
flyctl launch --no-deploy --copy-config --name clearkyc --region fra
```

Flagi:
- `--no-deploy` — nie deployujemy od razu, tylko generujemy config
- `--copy-config` — nie pyta interaktywnie o regeneracje istniejącego configa
- `--name clearkyc` — pin do zarezerwowanej nazwy
- `--region fra` — Frankfurt (potwierdzony wybór)

Po komendzie usuwamy `Dockerfile` jeśli wygenerowany (Paketo go nie potrzebuje):

```bash
[ -f Dockerfile ] && rm Dockerfile
```

### Krok 5 — Ręczna edycja `fly.toml`

Zastępujemy wygenerowany config następującym (kluczowe sekcje):

```toml
app = "clearkyc"
primary_region = "fra"

[build]
  builder = "paketobuildpacks/builder-jammy-base"
  [build.args]
    BP_JVM_VERSION = "21"

[env]
  SPRING_PROFILES_ACTIVE = "prod"
  SERVER_PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
  processes = ["app"]

  [[http_service.checks]]
    grace_period = "30s"
    interval = "15s"
    method = "GET"
    timeout = "5s"
    path = "/actuator/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

**Uzasadnienie kluczowych ustawień**:
- `auto_stop_machines = "off"` + `min_machines_running = 1` — wymuszone przez `infrastructure.md` risk register (JVM cold start 8–15s vs UX). Koszt: ~$1.94–3.19/mo. Bez tego pierwsza sesja analityka po idle wisi 12s.
- `BP_JVM_VERSION = "21"` — Paketo defaultuje do Java 17, co dla Spring Boot 4 (`jakarta.*`) jest subtelnie niezgodne. Wpisane explicite per `infrastructure.md` ryzyko z sekcji Unknown unknowns.
- `memory_mb = 512` — minimum dla Spring Boot 4 z Actuator. Może wymagać podbicia do 1024 jeśli JVM ma OOM przy starcie; jeśli tak, podbijamy w następnym ticku.
- `grace_period = "30s"` — JVM + Spring kontekst startuje 8–15s; 30s daje bufor.

### Krok 6 — Pierwszy deploy

```bash
flyctl deploy --remote-only
```

`--remote-only` używa builderów Fly.io (nie lokalnego Dockera) — szybciej, mniej zależności u dewelopera.

Spodziewany output:
- `Building image with buildpacks...`
- `Pushing image to fly...`
- `Deploying clearkyc app with rolling strategy...`
- `Machine <id> [app] update succeeded`
- `Visit your newly deployed app at https://clearkyc.fly.dev/`

### Krok 7 — Weryfikacja end-to-end

```bash
flyctl status                              # 1 machine started, region fra
flyctl logs --no-tail | tail -50           # ostatnie linie startupu Spring Boota
curl -i https://clearkyc.fly.dev/actuator/health
# spodziewane: HTTP/2 200, body: {"status":"UP"}

curl -i https://clearkyc.fly.dev/
# spodziewane: HTTP/2 404 (brak controllera) — to OK dla smoke deploya
```

Sygnały sukcesu:
- `flyctl status` → `Machines: 1 started`
- `/actuator/health` → 200 + `{"status":"UP"}`
- `flyctl logs` zawiera linię `Started ClearkycApplication in N seconds`
- Brak `OutOfMemoryError`, brak `Address already in use`, brak `Whitelabel error page` na `/actuator/health`

Sygnały do diagnozy (i co robić):
- 503 na `/actuator/health` → `flyctl logs`, sprawdź czy Spring wystartował; jeśli OOM, podbij `memory_mb` do 1024
- Build failuje na "no buildpack matched" → sprawdź `fly.toml` `[build].builder`, czy `pom.xml` jest w root
- `Java version mismatch` w logach → potwierdź `BP_JVM_VERSION=21` w `[build.args]`
- App się buduje ale machine nie startuje → `flyctl machine list`, `flyctl machine status <id>`

### Krok 8 — Commit do gita

Jedna paczka:

```
deploy: bootstrap Fly.io smoke deploy

- add spring-boot-starter-actuator + /actuator/health exposure
- add fly.toml (Paketo + Java 21 + fra, auto_stop=off, min=1)
- gitignore .fly/
- context/deployment/deploy-plan.md as audit trail
```

Plan nie pushuje sam — push jest user-gated.

## Weryfikacja

End-to-end po wykonaniu kroków 1–8:

1. `flyctl status --app clearkyc` → `Machines: 1 started`, region `fra`
2. `curl -i https://clearkyc.fly.dev/actuator/health` → `200 OK` z body `{"status":"UP"}`
3. `flyctl logs --app clearkyc --no-tail` → zawiera `Started ClearkycApplication in <8–15>s`, brak ERROR / OOM
4. `flyctl releases list --app clearkyc` → release `v1` w stanie `succeeded`
5. `flyctl secrets list --app clearkyc` → pusta lista (brak DB secretów na tym etapie — to celowe)
6. Plik `context/deployment/deploy-plan.md` istnieje i jest commitowany
7. Lokalnie `./mvnw test` przechodzi (sanity że Actuator nie zepsuł kontekstu)

## Co jest poza zakresem (świadomie odłożone)

- **CockroachDB Serverless + JPA + Flyway** — następny PR. Tam rozwiązujemy `SPRING_DATASOURCE_URL` vs `DATABASE_URL` oraz `CockroachDialect` z Hibernate 7.x (Spring Boot 4 ships Hibernate 7 — należy zweryfikować że `org.hibernate.dialect.CockroachDialect` nadal istnieje w 7.x; w 6.x był).
- **GitHub Actions auto-deploy-on-merge** — następny PR, po smoke deployu. Wymaga `FLY_API_TOKEN` w GitHub Secrets (`flyctl tokens create deploy -x 999999h`).
- **OAuth2 resource server (FR-001)**, **JSON Schema validator (FR-012)**, **SSE controller (FR-005–008)**, **LLM SDK** — wszystko niezwiązane z deployment plumbing; każde dostaje własny PR po smoke deployu.
- **Angular SPA w `web/`** — sibling concern, scaffold osobno przez `ng new web --routing --style scss`.
- **CLOUD Act / DPO rozmowa dla pilota** — blocker dla *produkcyjnego pilota z polskim bankiem*, nie dla smoke deploya bez PII. Notatka, nie task tego planu.
- **Custom domain** (`api.clearkyc.com` zamiast `clearkyc.fly.dev`) — po decyzji o domenie.
- **Monitoring/alerting beyond Fly's built-in Grafana** — defer.

## Notatki krzywej ryzyka dla executora

- **App name conflict**: jeśli `clearkyc` jest zajęte w globalnym namespace Fly.io, fallback do `clearkyc-pl`. Nie blokuje deploya — tylko zmienia URL.
- **Memory pressure**: jeśli 512 MB jest za mało dla Spring Boot 4 (devtools wyłączone w prod, ale Spring Security + Actuator + JIT footprint), pierwsza ofiara to OOM przy starcie. Podbijamy `[[vm]].memory_mb` do 1024 i `flyctl deploy` ponownie.
- **Paketo builder name drift**: `paketobuildpacks/builder-jammy-base` jest aktualny na 2026-05; jeśli Paketo wypuści nowy stack przed deployem, sprawdzamy `https://paketo.io/docs/concepts/builders/`.
- **Brak SCM info w `pom.xml`** (`<scm><connection/>...</scm>` pusty) — Paketo nie używa tego do build, ale niektóre buildpacks emitują warning. Ignorowalne.
- **DevTools w prod**: `spring-boot-devtools` ma `<scope>runtime</scope>` `<optional>true</optional>` — Spring Boot Maven plugin domyślnie *wyłącza* devtools w produkcyjnym JAR, więc nie ma ryzyka, że gorące przeładowanie pojawi się w prod. Sanity-check: w logach po starcie *nie powinno* być linii `LiveReload server is running on port 35729`.

## Stan po deployu

- **URL appki**: `https://clearkyc.fly.dev/`
- **Region**: `fra` (obie maszyny)
- **Wersja release Fly**: `v2` complete (v1 failed — patrz "Odchylenia od planu" niżej)
- **Data deploya**: 2026-05-20
- **Wpięte secrets**: brak — smoke deploy bez DB
- **Stan machine**: 2× `started`, role puste, checks `1 total, 1 passing` na `/actuator/health`
  - `68397edc61d228` (fra)
  - `7846025c49d548` (fra) — drugi node dodany przez Fly auto-HA mimo `min_machines_running = 1` (default behaviour dla `min_machines_running >= 1` + `auto_start_machines = true`; "high availability and zero downtime")
- **Image**: `registry.fly.io/clearkyc:deployment-01KS20FK3ZQB7SBKZDF6BHSACE`, rozmiar 668 MB
- **Czas startu Spring Boota**: 6.278 s na Java 21.0.11 (Paketo bp-jvm wybrał `21.0.11_amzn-corretto`)
- **Hash commita**: `07d760f` (`deploy: bootstrap Fly.io smoke deploy`) na bazie `696d18b` (`init: bootstrap Spring Boot 4 + ClearKYC context`)

### Walidacja end-to-end

- `flyctl status` → 2 maszyny `started`, checks passing
- `curl -i https://clearkyc.fly.dev/actuator/health` → `HTTP/2 200`, body `{"groups":["liveness","readiness"],"status":"UP"}`
- `curl -i https://clearkyc.fly.dev/` → `HTTP/2 404` (brak controllera — zgodnie z planem)
- `flyctl logs` → `Started ClearkycApplication in 6.278 seconds`, brak ERROR/OOM, brak `LiveReload server is running` (devtools wyłączone w prod jak przewidywał plan)
- `flyctl releases` → `v2 complete`, `v1 failed`
- `./mvnw test` (lokalnie) → pass, Actuator nie zepsuł kontekstu Spring Boota

### Odchylenia od planu

1. **`memory_mb = 1024` zamiast planowanych `512`** — podbite proaktywnie przed pierwszym deployem (sekcja "Notatki krzywej ryzyka" planu przewidywała OOM przy 512 MB; nie czekaliśmy na empiryczny OOM). Koszt nieznacznie wyższy, ~$3/mo zamiast ~$2/mo, w granicach budżetu z `infrastructure.md`.
2. **Build remote-only padł 4× transient bugiem buildera Fly w `ams`** — VM builder (`78401e1c6211d8`, potem `48e122ec359e68`) kończyła w stanie którego Fly nie umiał zrestartować mimo destroy + ponownego utworzenia. Workaround: `flyctl deploy --local-only` — buduje Paketo image na lokalnym Dockerze i pushuje do `registry.fly.io`. Wadą `--local-only`: ~5 min na pierwszy build (download warstw buildpacków), brak Fly-side cache między buildami; przewaga: omija broken remote builder. Następny PR ma opcjonalnie wrócić do `--remote-only` jeśli regionalny bug Fly minie.
3. **`v1` release w `flyctl releases` ma status `failed`** — zostawiony jako audit trail tych 4 remote-build prób. Nie wpływa na bieżący stan (`v2 complete` jest aktywny).
4. **`auto_stop_machines = "off"` po stronie Fly zapisany jako `auto_stop_machines: false`** — Fly silently coerces string `"off"` na boolean `false`. Semantycznie równoważne (oba oznaczają "never stop"). Nieszkodliwe, ale warto wiedzieć przy przyszłym `flyctl config diff`.
