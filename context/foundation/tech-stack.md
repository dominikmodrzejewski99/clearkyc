---
starter_id: spring
package_manager: maven
project_name: clearkyc
hints:
  language_family: java
  team_size: solo
  deployment_target: fly
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: false
    from_official_starter: true
    conventions: false
    docs_current: false
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Custom path. The user explicitly chose the Angular + Spring Boot + PostgreSQL enterprise banking stack over the recommended `10x-astro-starter` default for `(web, js)`, anchoring on Spring Boot because the backend carries the load-bearing surface — managed-IdP auth (FR-001), JPA-persisted audit ledger (FR-013), JSON Schema validation on the finalization record (FR-012), Postgres for case state, and the server-side LLM streaming endpoint for FR-005–008 extraction. The Angular SPA is a sibling concern to be scaffolded in a second pass into a `web/` subfolder. Spring clears all four agent-friendly gates and bootstrapper-confidence is `verified`. Two real risks are recorded for downstream awareness: the 6-week after-hours-only PRD timeline against a basic-Java + Angular-only fluency profile, and a self-check where 4 of 5 statements went unmarked (notably `can_judge_agent: false`) — bootstrapper should compensate with a thicker Spring/JPA/Spring-Security CLAUDE.md. `has_ai` is recorded `true` per PRD FRs 005–008 despite being unchecked in the feature audit; the PRD is the contract. Fly.io is Spring's deployment default; CI/CD is GitHub Actions with auto-deploy on merge.
