---
id: citation-scroll-fix
title: "Naprawa scrollowania do cytatu w PDF viewer"
status: implementing
created: 2026-06-20
updated: 2026-06-20
roadmap_ref: S-05
prd_refs: FR-009
prerequisites: workstation-detail-fidelity
---

## What

Naprawia nieprawidlowe i niesatysfakcjonujace dzialanie scrollowania do miejsca cytatu w PDF viewer.

## Why

Klikniecie na cytat w ExtractionForm lub CitationBadge powinno przewijac PDF do konkretnego miejsca w dokumencie. Obecna implementacja ma krytyczny bug (mismatch pol pageNumber/page) oraz architektoniczne ograniczenia (brak koordynat, potencjalne problemy timingowe).
