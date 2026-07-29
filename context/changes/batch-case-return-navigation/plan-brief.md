# Batch Case Return Navigation — Plan Brief

> Full plan: `context/changes/batch-case-return-navigation/plan.md`
> Frame brief: `context/changes/batch-case-return-navigation/frame.md`

## What & Why

Case detail traci informację o źródłowym batchu. Zachowamy ją w URL, aby link
„Sprawy” i redirect po decyzji wracały do właściwego dashboardu.

## Starting Point

Dashboard nawiguje bez kontekstu. Dwa wyjścia z case detail mają stały cel listy
spraw.

## Desired End State

Case otwarty z batchu wraca do tego batchu. Zwykły case nadal wraca do listy.
Zachowanie przeżywa refresh strony.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Transport kontekstu | Query param `batchId` | Przeżywa refresh i jest jawny | Plan |
| Oba wyjścia | Wspólny target | Brak rozjazdu link/redirect | Frame |
| Fallback | `/cases/new` | Zachowuje zwykły flow | Frame |

## Scope

**In scope:** dashboard, case detail, topbar, testy.

**Out of scope:** backend, globalna historia, automatyczne wykrywanie batchu.

## Architecture / Approach

`/batch/:batchId` → `/cases/:id?batchId=:batchId` → wspólny return target.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Navigation | Kontekstowy powrót i testy | Regresja zwykłego flow |

**Prerequisites:** brak.
**Estimated effort:** jedna krótka sesja.

## Open Risks & Assumptions

- `batchId` pochodzi wyłącznie z dashboardu batch.
- Brak parametru zawsze oznacza zwykły flow.

## Success Criteria

- „Sprawy” i decyzja wracają do źródłowego batchu.
- Zwykły case zachowuje fallback.
- Testy, lint i build przechodzą.
