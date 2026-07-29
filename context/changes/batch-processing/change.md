---
change_id: batch-processing
title: Masowe przetwarzanie dokumentów — upload N plików, równoległa analiza, dashboard postępu
status: implementing
created: 2026-07-24
updated: 2026-07-29
archived_at: null
---

## Notes

Rozszerzenie PRD o batch processing. Aktualny PRD jawnie mówi "one case at a time" i "single-PDF MVP" jako non-goal scope. Ta zmiana rozszerza produkt o:

- Upload wielu PDF-ów jednocześnie (multi-file dropzone)
- Automatyczne tworzenie case'ów per plik
- Równoległa analiza/ekstrakcja SSE dla wielu case'ów
- Dashboard z postępem batch (ile gotowych, ile w trakcie, ile z błędem)
- Nawigacja do poszczególnych case'ów z batch dashboard
- Decyzja (Approve/Reject/Escalate) nadal ręczna per case

Backend nie ma jeszcze endpointu masowego — trzeba zaprojektować API contract (batch create + batch status polling/SSE).
