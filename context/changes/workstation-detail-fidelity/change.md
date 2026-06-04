---
id: workstation-detail-fidelity
title: "Workstation case-detail fidelity"
status: implementing
created: 2026-06-04
updated: 2026-06-04
roadmap_ref: S-05
prd_refs: FR-009, FR-012, FR-011
prerequisites: S-01, S-04
---

## What

Doprowadza widok case-detail do pełnej wierności projektu workstation:
- Topbar z logo CK, nazwą encji, ID sprawy i wskaźnikiem stanu analizy
- Dwuetapowy commit decyzji (wybór → "Commit decision")
- Amber warning w DecisionBar gdy są pola missing
- Nagłówek panelu PDF z tytułem "Source document" i liczbą stron
- Backend: `entity_name` w `kyb_case` + `CaseDetailResponse`

## Why

S-04 doprowadził upload screen do wierności projektu. S-05 domyka widok analityczny (case-detail) — topbar daje kontekst sprawy, dwuetapowy commit zabezpiecza przed przypadkowym zatwierdzeniem.
