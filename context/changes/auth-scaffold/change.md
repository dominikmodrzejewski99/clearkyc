---
change_id: auth-scaffold
roadmap_id: F-01
status: impl_reviewed
created: 2026-05-31
updated: 2026-05-31

---

# F-01: Managed-IdP Auth Scaffold

**Outcome:** wszystkie trasy aplikacji poza statycznymi plikami SPA chronione przez Auth0 (OIDC); tokeny JWT weryfikowane przez Spring Security Resource Server; nieuwierzytelnione requesty do `/api/**` zwracają 401; Angular guard przekierowuje do Auth0 Universal Login.

**PRD refs:** FR-001, sekcja Access Control

**Unlocks:** S-01, S-02, S-03
