# Batch Case Return Navigation — Implementation Plan

## Overview

Zachować kontekst źródłowego batchu podczas przejścia dashboard → case detail.
Link „Sprawy” i redirect po decyzji wracają do `/batch/:batchId`; zwykły case
zachowuje powrót do `/cases/new`.

## Current State Analysis

- Dashboard otwiera `/cases/:id` bez informacji o źródle.
- Case detail zna wyłącznie `id`.
- Topbar ma stały `routerLink="/cases"`.
- `onDecided()` ma stały redirect do `/cases/new`.
- Angular 22 router obsługuje odświeżalny kontekst przez query params.

## Desired End State

Dashboard otwiera `/cases/:id?batchId=<id>`. Case detail wylicza jeden cel
powrotu. Topbar i redirect po decyzji używają tego samego celu. Brak albo pusty
`batchId` daje `/cases/new`.

## What We're NOT Doing

- Globalna historia nawigacji.
- Automatyczne wykrywanie batchu na podstawie aktywnego store.
- Zmiany backendu lub modelu danych.
- Zmiana zachowania case’ów otwieranych poza batchem.

## Implementation Approach

Jawny query param jest źródłem kontekstu. Jest widoczny, odświeżalny i nie
przypisuje przypadkowo zwykłego case’a do aktywnego batchu.

## Phase 1: Context-aware return navigation

### Changes Required

#### 1. Pass batch context

**File**: `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.ts`

**Intent**: Zachować źródłowy batch przy otwarciu case’a.

**Contract**: `onOpen()` nawiguje do `/cases/:id` z query param `batchId`
pochodzącym z `BatchStore`.

#### 2. Resolve return target

**File**: `web/src/app/features/case-detail/case-detail.component.ts`

**Intent**: Jeden cel powrotu dla topbara i decyzji.

**Contract**: Niepusty `batchId` daje `/batch/:batchId`; brak daje
`/cases/new`. `onDecided()` używa wyliczonego celu.

#### 3. Make topbar destination configurable

**Files**:

- `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.ts`
- `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`
- `web/src/app/features/case-detail/case-detail.component.html`

**Intent**: Link „Sprawy” używa tego samego celu co redirect po decyzji.

**Contract**: Topbar przyjmuje route commands jako input; domyślny cel pozostaje
`/cases/new`.

#### 4. Add regression coverage

**Files**:

- `web/src/app/features/case-detail/case-detail.component.spec.ts`
- `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.spec.ts`

**Intent**: Chronić batch i zwykły flow.

**Contract**: Testy potwierdzają query param na wejściu, powrót do batchu,
fallback oraz brak regresji zwykłego case’a.

### Success Criteria

#### Automated Verification

- `npm test -- --watch=false` przechodzi.
- `npm run lint` przechodzi.
- `npm run build` przechodzi.

#### Manual Verification

- Case otwarty z batchu: „Sprawy” wraca do dashboardu batchu.
- Po decyzji case otwarty z batchu wraca do dashboardu batchu.
- Case otwarty bez `batchId` wraca do listy spraw.

## Testing Strategy

### Unit Tests

- Dashboard przekazuje bieżący `batchId`.
- Case detail wylicza batch target i fallback.
- Topbar renderuje przekazany cel.

### Manual Testing Steps

1. Otwórz batch i case przez „Otwórz case”.
2. Zatwierdź decyzję i sprawdź powrót do tego batchu.
3. Otwórz zwykły case i sprawdź powrót do listy spraw.

## Performance Considerations

Brak mierzalnego wpływu. Zmiana dodaje pojedynczy query param i computed target.

## Migration Notes

Brak migracji. Stare linki bez `batchId` używają fallbacku.

## References

- Frame: `context/changes/batch-case-return-navigation/frame.md`
- `web/src/app/features/batch/batch-dashboard/batch-dashboard.component.ts`
- `web/src/app/features/case-detail/case-detail.component.ts`
- `web/src/app/shared/components/workstation-topbar/workstation-topbar.component.html`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Context-aware return navigation

#### Automated

- [x] 1.1 `npm test -- --watch=false` passes — 9a080e7
- [x] 1.2 `npm run lint` passes — 9a080e7
- [x] 1.3 `npm run build` passes — 9a080e7

#### Manual

- [x] 1.4 Batch case returns to source dashboard through “Sprawy” and after decision — 9a080e7
- [x] 1.5 Regular case keeps list fallback — 9a080e7
