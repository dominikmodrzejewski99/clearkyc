---
change_id: red-flag-taxonomy
title: Red flag detection with placeholder taxonomy (S-03)
status: implementing
created: 2026-06-01
updated: 2026-06-01
archived_at: null
---

## Notes

Taksonomia jako Java enum RedFlagCategory z 6 seed-kategoriami z PRD Open Question 1.
Single-pass LLM: pola streamed + red flags na końcu jako RedFlagsFound SSE event.
Red flags read-only w v1 (brak per-flag dismiss). Sekcja poniżej ExtractionForm.
Bank podmieni enum values bez zmiany architektury.
