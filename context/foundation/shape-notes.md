---
project: ClearKYC
version: 1
status: draft
created: 2026-05-18
updated: 2026-05-18
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 6
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: pain category
      decision: missing capability (legacy KYC stack structurally cannot comprehend unstructured narrative documents)
    - topic: why incumbents have not shipped this
      decision: vendor incentives + regulatory caution — incumbents will not bet compliance reputation on hallucination-prone LLMs; analyst-in-the-loop extraction with provenance is a different product shape from their structured-lookup core
    - topic: primary persona scope
      decision: Senior KYB Analysts inside one specific bank's compliance team (design-partner model; multi-tenant deferred)
    - topic: authentication shape
      decision: bank SSO via corporate IdP (SAML or OIDC); no app-local credentials
    - topic: role model in MVP
      decision: flat — one role (Senior KYB Analyst); reviewer/admin roles explicitly deferred
    - topic: audit trail requirement
      decision: every analyst action attributable (who did what, when) from day one — non-negotiable for banking compliance
    - topic: v1 auth deferral
      decision: bank SSO deferred to v2 — v1 ships with app-local credentials for design-partner demo; SSO/IdP integration runs as a parallel workstream
    - topic: citation richness in v1
      decision: click-to-highlight in PDF is IN v1 (reversed from initial Phase 3 drop); analyst clicks a field, embedded PDF jumps to the page and highlights the cited source text. Quoted-snippet text is shown alongside the field too.
    - topic: v1 timeline
      decision: ~6 weeks of after-hours work; user accepted the sustained-effort cost after un-scoping click-to-highlight back into v1. Bank SSO remains deferred to v2.
    - topic: audit-trail mechanism
      decision: single append-only audit-log table — every analyst edit and approval is an INSERT; NOT event-sourcing. Banking-compliance non-negotiable from Phase 2 stands.
    - topic: report export in v1
      decision: JSON only; formatted PDF report deferred to v2 nice-to-have
    - topic: audit-trail final scope (supersedes earlier entries)
      decision: finalization-only audit record (one row per case lock with user + timestamp + terminal decision + locked values + citations + every override justification from FR-010). Per-edit append-only logging deferred to v2 with a defined retention + GDPR redaction policy. Walks back the earlier Phase-2 "every action" framing after Socrates round 4 surfaced debounce noise + immutable-PII-ledger risk.
    - topic: red-flag emission timing
      decision: red flags appear only after full-document analysis completes; entity extraction streams in real time, red-flag classification does not. Bound to a closed taxonomy (Open Question 1).
    - topic: citation cardinality and absence-of-evidence
      decision: each populated field carries an array of one-or-more verbatim quoted-snippet citations (supports multi-page synthesis); fields derived from absence-of-evidence carry an explicit "Not Disclosed / Inferred Missing" marker that can chain into a red-flag entry.
    - topic: terminal decision model
      decision: three terminal decisions (Approve / Reject / Escalate), all triggering identical v1 system behavior (lock + JSON export); reviewer queues + escalation routing deferred to v2.
  frs_drafted: 12
  quality_check_status: accepted
---

# Shape Notes

Seed idea (verbatim from user):

> A back-office KYC (Know Your Customer) dashboard for banking compliance teams. It uses an LLM to ingest B2B financial documents, extracts risk factors, and streams the analysis in real-time to a highly reactive Angular frontend. The focus is on a high-density, high-performance UI for analysts.

## Forward: tech-stack

Stack-shaped hints captured from the seed idea — NOT part of the PRD. The next chain step (`/10x-tech-stack-selector`) picks these up.

- User mentioned "Angular frontend" as the UI framework.
- User mentioned "LLM" for document analysis (model/provider unspecified).
- User mentioned "streaming" / "real-time" — implies server-sent events, websockets, or similar transport.
- User identified Supabase or Clerk shape for FR-001 — a managed identity provider that gives local-auth UX now with a configuration-only upgrade path to SAML/OIDC. Pin the FR as stack-neutral; pass the candidate provider names to tech-stack selection.

## Vision & Problem Statement

Senior KYB Analysts at banks spend 4–8 hours manually verifying each complex multi-layered B2B onboarding application, working from hundreds of pages of unstructured narrative documents — trust deeds, legal statutes, ownership-structure charts, corporate filings. Legacy KYC platforms (Actimize, Lexis Bridger) excel at structured lookups against sanctions and PEP lists but provide zero comprehension of narrative content, forcing analysts to abandon those tools mid-review and fall back on PDF readers and Excel/SharePoint scratchpads. The result is a severe throughput bottleneck and inconsistent risk reasoning across analysts driven by mental fatigue.

The insight is not that LLMs can read documents — that is obvious. The insight is why incumbents have not shipped this: their compliance reputation is built on deterministic structured lookups and they will not stake it on hallucination-prone generative output. The open lane is an **analyst-in-the-loop product** where the LLM extracts and stages risk factors with full source provenance, and a human analyst remains the decision-maker. That is a different product shape from the incumbents' core, and the bet is that the high-density real-time UI that surfaces extracted facts with provenance — not the model call itself — is the durable advantage.

## User & Persona

**Primary persona: Senior KYB Analyst (Know Your Business).**

- Role: verifies complex corporate entities during B2B onboarding for a bank's compliance team.
- Context: works inside one specific bank's compliance org (design-partner scope; multi-tenant deferred).
- Moment they reach for this product: a new multi-layered B2B onboarding application lands in their review queue and they need to assess UBOs, ownership chains, jurisdictional risk, and narrative red flags before signing off.
- Current behavior: opens legacy KYC tool for structured screening, then switches to PDF reader for narrative documents, pasting findings into Excel or SharePoint as they go.

Secondary personas (e.g., junior KYB analysts, AML investigators, onboarding ops, team-lead sign-off reviewers) are explicitly out of MVP scope and revisited after the senior-analyst flow works end-to-end.

## Access Control

Authenticated, single-role, fully audited.

- **Sign-in (v1):** app-local credentials, sufficient for a single design-partner demo. The full bank SSO integration (SAML/OIDC against the bank's corporate IdP) is the target end-state and runs as a parallel workstream; v2 swaps app-local for SSO without re-shaping the rest of the product.
- **Sign-in (target end-state):** bank corporate IdP (SAML or OIDC); no app-local credentials; no public sign-up.
- **Roles in MVP:** a single role, *Senior KYB Analyst*. Every authenticated user has identical capabilities. Reviewer, approver, and admin roles are deferred and listed in Non-Goals.
- **Unauthenticated access:** there are no publicly-reachable routes other than the SSO redirect. Any deep link reached by an unauthenticated session is bounced through the IdP.
- **Audit:** at the moment a case is finalized (Approve / Reject / Escalate), the system records an attributed audit record — authenticated identity, timestamp, terminal decision, locked field values, citations, and every override justification accumulated during the session. Per-edit append-only logging is explicitly out of v1 scope (rationale: debounce noise + GDPR redaction risk on an immutable PII ledger; revisit in v2 with a defined retention/redaction policy). What is preserved for the regulator: full attribution of the final decision plus the analyst's stated reasons for every override of an LLM extraction.

## Success Criteria

### Primary
- A Senior KYB Analyst can take a single complex B2B PDF from upload to a verified, audit-trailed approval in a single ClearKYC session, without leaving the dashboard for the legacy KYC tool or for Excel/SharePoint during the verification step. Extracted entities stream into the form in real time as the model reads the document; red flags appear at end-of-analysis bound to a closed taxonomy. Every populated field carries at least one quoted-snippet citation, or carries an explicit "Not Disclosed / Inferred Missing" marker if the value is derived from absence of evidence.

### Secondary
- The same case completes in under one hour of analyst time, versus the 4–8 hour manual baseline. Speed is the productivity story but is downstream of correctness — Primary holding without this is still a win; this holding without Primary is not.

### Guardrails
- No extracted field is ever displayed to the analyst without an accompanying source citation. If the model cannot produce a citation for a value, the field remains empty and is surfaced to the analyst as an explicit gap, not a confident answer.
- Every terminal decision (Approve / Reject / Escalate) is persisted to the audit record *before* the UI confirms finalization to the analyst. A confirmation the analyst can see is a finalization that has already been audited. (Per-edit logging is out of v1 scope; the finalization record bundles all override justifications from FR-010.)

## Timeline acknowledgment

Acknowledged on 2026-05-18: 6-week MVP requires sustained dedication; user accepted the cost after un-scoping click-to-highlight citations back into v1 (the killer trust feature for an LLM-augmented compliance product). Bank SSO remains deferred to v2 as a parallel workstream.

## Functional Requirements

### Authentication
- FR-001: Senior KYB Analyst can sign in via a managed identity provider that supports a configuration-only upgrade path to SAML/OIDC SSO without changing user-facing flows. Unauthenticated requests to any non-login route are bounced to sign-in. Priority: must-have
  > Socrates: Counter-argument considered: "App-local credentials become a credential-storage liability we then carry forever" AND "blocking on enterprise SSO is fatal for velocity". Resolution: delegate to a managed IdP — no custom credential store, no SSO-build blocker, configuration-only upgrade to SAML later. FR-002 (auth-guard redirect) folded in as implementation of the same FR.

### Case lifecycle
- FR-004: Senior KYB Analyst can attach a single PDF document via drag-and-drop or file picker; the act of attaching creates the case. Multi-document review is out of scope (analyst pre-merges locally if needed). Priority: must-have
  > Socrates: Counter-argument considered: "Real KYB reviews involve 5–10 docs; single-PDF MVP is artificial" AND "drag-and-drop excludes accessible/scripted paths". Resolution: keep single-doc to prove the UI/LLM streaming loop without building cross-document RAG; broaden the gesture to drag-and-drop OR file picker. FR-003 (empty case) folded in — drag-drop is what creates the case, eliminating the empty-case state.
- FR-005: Senior KYB Analyst can trigger analysis on the attached document with an explicit "Analyze" action. Until the analyst triggers analysis, the case displays file-attached confirmation (filename, page count, size) but no model has been called. Priority: must-have
  > Socrates: Counter-argument considered: "Auto-start on upload removes a click." Resolution: the explicit trigger is a deliberate safety latch — LLM cost on dense 50-page financial PDFs is non-trivial, and the pre-analysis "Loaded/Ready" state lets the analyst confirm the right file is attached before committing to a long-running async operation.

### Extraction & verification
- FR-006: Senior KYB Analyst can see extracted entities (company name, directors, UBOs) stream into a structured form in real time as analysis progresses, with the streaming view itself acting as a high-fidelity progress indicator. Priority: must-have
  > Socrates: Counter-argument considered: "Streaming partial structured data renders broken fields; a single 'done' state is cleaner." Resolution: partial-render risk is solvable with reactive state primitives (signal/stream patching); the alternative (opaque spinner for 30–60s) produces black-box anxiety on LLM-bound operations and erodes trust. Streaming the extraction *is* the trust-building progress indicator.
- FR-007: Senior KYB Analyst can see identified red flags appear in a structured form *after* the document's full context has been processed (red flags are NOT streamed). Each red flag is bound to a pre-defined risk taxonomy (see Open Questions — the taxonomy itself is unresolved). Priority: must-have
  > Socrates: Counter-argument considered: "Streaming red flags during partial parse creates false alarms when later pages clarify the suspicion (e.g., 'opaque ownership' on page 5 resolves on page 45)" AND "without a pre-defined taxonomy the LLM invents categories and analyst trust collapses." Resolution: defer red-flag emission to end-of-analysis, and bind each flag to a closed taxonomy. The taxonomy is a Block: yes Open Question routed to /10x-prd.
- FR-008: Every populated extracted field is displayed alongside an array of one or more verbatim quoted-snippet citations from the source document (supports multi-page synthesis). If a field's value is derived from absence of evidence, the field shows an explicit "Not Disclosed / Inferred Missing" marker rather than staying empty; such a marker is itself a valid input to the red-flag taxonomy in FR-007. Priority: must-have
  > Socrates: Counter-argument considered: "Single-citation-or-empty rule kills cross-page synthesis AND mis-represents inferred-from-absence findings (a missing UBO IS the finding, not the absence of one)." Resolution: citations become an array (one or more snippets per field), and "Not Disclosed / Inferred Missing" is a first-class value that can chain into a red flag. The trust contract — every shown value is justifiable — holds.
- FR-009: Senior KYB Analyst can view the source PDF embedded in the dashboard alongside the extracted-data form, presented as a resizable, collapsible split-pane rather than a rigid layout. The analyst adjusts the document-vs-form ratio without losing context, accommodating cramped 1080p monitors typical in banking back-office environments. Priority: must-have
  > Socrates: Counter-argument considered: "Side-by-side wastes horizontal space on standard analyst monitors." Resolution: keep side-by-side because click-to-highlight (FR-014) is meaningless without it, but switch from rigid 50/50 to a resizable + collapsible split-pane so the analyst keeps control.
- FR-010: Senior KYB Analyst can manually edit any extracted field, with editing behavior bifurcated by field type. Taxonomy-bound fields (e.g., red-flag category) are constrained to the closed taxonomy via UI elements (e.g., dropdowns). Free-text fields (e.g., UBO name) accept arbitrary text, but any override of an LLM-extracted value requires a mandatory short "override justification" note before the edit is accepted. Priority: must-have
  > Socrates: Counter-argument considered: "Free editing orphans the citation AND corrupts the taxonomy." Resolution: split the editing model — taxonomy fields are dropdown-only (no free text); extraction-field overrides demand a justification note that becomes part of the audit log alongside the original AI citation. Provenance is preserved by capturing the human's reason rather than retaining the now-stale citation as if it still justified the value.
- FR-014: Senior KYB Analyst can click a specific extracted field or red flag in the structured form and the embedded PDF viewer navigates to the relevant page; the system additionally attempts a best-effort text-level highlight of the source span. If the highlight fails (text-layer mismatch, OCR variance, scanned-page coordinates, etc.), the viewer still lands on the correct page and the side panel prominently displays the verbatim quoted snippet so the analyst can locate the source visually. Priority: must-have
  > Socrates: Counter-argument considered: "Coordinate-mapped highlighting is fragile on scanned/foreign-registry docs; a partial-fail highlight erodes trust worse than no highlight." Resolution: graceful degradation — page-level navigation is the reliable primary action; text-span highlight is a best-effort secondary; on failure the snippet-in-side-panel becomes the fallback. The analyst always has page + snippet, never less.

### Decision & export
- FR-011: Senior KYB Analyst can lock a case by selecting one of three terminal decisions — Approve, Reject, or Escalate. All three decisions trigger identical system behavior in v1 (lock the form, generate the FR-012 JSON export with the chosen status attached); reviewer/escalation routing is deferred to v2 once roles exist. Priority: must-have
  > Socrates: Counter-argument considered: "Binary 'Approve' is too restrictive; real KYB decisions are approve / reject / escalate / request-more-docs." Resolution: capture the three terminal decisions in the UI to reflect business reality, but keep system behavior identical for v1 (no reviewer queue, no escalation routing). Captures domain intent without backend workflow bloat.
- FR-012: Upon a terminal decision (Approve / Reject / Escalate), the system generates a JSON file containing the verified data, the array of citations per field, override justifications, and the analyst's decision. The output is strictly validated against a versioned, explicitly defined JSON Schema declared alongside the codebase. Priority: must-have
  > Socrates: Counter-argument considered: "JSON-only is useless to compliance officers who need PDF/CSV." Resolution: keep JSON-only for v1 (a formatted PDF report is a v2 nice-to-have) but mandate a versioned JSON Schema so the output is robust and downstream-transformable rather than a free-form tech demo.

### Audit
- FR-013: At the moment of case finalization (FR-011), the system records the locked case state as a single audit record: user identity, timestamp, terminal decision (Approve / Reject / Escalate), the verified data values, the citations array per field, AND every override justification accumulated from FR-010 during the session. Per-edit append-only logging is NOT in scope for v1. Priority: must-have
  > Socrates: Counter-argument considered: "Logging every edit produces typo-correction noise AND creates a GDPR-redaction time-bomb without a defined retention policy." Resolution: scope the audit log to one record per finalization rather than one per edit. Override justifications captured per FR-010 survive into the finalization record, so attribution + explanation are intact for the regulator. What's lost is the chronological exploration path within a session, accepted for v1; multi-analyst forensics is a v2 concern. Data retention + GDPR redaction strategy are routed to Open Questions.

## User Stories

### US-01: Analyst takes a complex B2B PDF from upload to audited approval

- **Given** a Senior KYB Analyst signed in to ClearKYC,
- **When** they create a new case, drag-and-drop a complex B2B PDF (e.g., a 50-page Articles of Association), and click "Analyze",
- **Then** they see extracted entities (company name, directors, UBOs) and red flags stream into a structured form alongside the embedded PDF in real time, each field carrying a verbatim quoted snippet citation,
- **And** clicking any field navigates the embedded PDF to the cited page with the source text visually highlighted,
- **And** the analyst can edit any field whose value the LLM got wrong,
- **And** on clicking "Approve KYC" the case is locked, a JSON report is generated containing the verified data + citations + decision, and every prior edit plus the approval itself is recorded in the append-only audit log before the UI confirms the approval.

#### Acceptance criteria
- Streaming entity extraction surfaces at least one structured field within 5 seconds of clicking "Analyze" for a representative 50-page B2B PDF.
- Red flags appear only after full-document analysis completes; each red flag belongs to one entry in the (TBD) red-flag taxonomy.
- Every populated field carries an array of one or more quoted-snippet citations; fields where the LLM determined absence-of-evidence show an explicit "Not Disclosed / Inferred Missing" marker rather than an empty value, and such markers can themselves chain into a taxonomy-bound red flag.
- Click-to-highlight resolves to the cited page and visibly highlights the source text within 500 ms of the click on a representative document.
- Editing a field, approving the case, and reloading the page in a fresh session returns the same locked values and the same audit-log entries — no audit row is lost, no value drifts.

## Open Questions

1. **What is the closed red-flag taxonomy?** — FR-007 requires every flag to map to a pre-defined category (e.g., sanctions exposure, shell-company indicators, jurisdiction risk, opaque ownership, PEP linkage, sector-specific risk). Without it, the LLM invents categories and analyst trust collapses. Owner: user (likely sourced from the design-partner bank's existing compliance risk catalog). Block: yes — FR-007 cannot be implemented without it.
2. **What is the audit record retention policy + GDPR redaction model?** — FR-013 records PII (UBO names, director identities) in the finalization record. Without a defined retention window and a redaction procedure for right-to-erasure requests, the record becomes a regulatory time-bomb. Owner: user (legal/DPO at design-partner bank). Block: no for the MVP demo, yes before any pilot with real customer data.
3. **Will the design-partner bank tolerate sending document content to an external LLM provider?** — All extraction FRs (FR-005..FR-014) assume an LLM has access to the full document. Banks frequently prohibit this for confidential corporate filings. Owner: user (bank infosec). Block: yes for any production deployment; v1 demo may use synthetic documents to defer the answer.
4. **JSON Schema version for FR-012 export** — Schema must be defined and committed alongside the code; downstream consumers will pin to a version. Owner: implementer. Block: no for v1 if schema is pinned at v0.1.

## Business Logic

From a single unstructured B2B PDF, ClearKYC extracts structured KYB entities (company identity, directors, UBOs) and classifies risk factors against a closed red-flag taxonomy, surfacing each value alongside the verbatim source passage(s) that justify it so the analyst can verify, override-with-justification, or accept before signing the case off with a recorded decision.

The rule consumes a single B2B PDF (e.g., Articles of Association, corporate-registry extract, trust deed) and the closed red-flag taxonomy (Open Question 1). It produces, per case, a structured set of typed extraction fields — each carrying either a non-empty array of quoted source citations OR an explicit "Not Disclosed / Inferred Missing" marker that itself can chain into a taxonomy-bound red flag — and a list of red flags emitted only after the document's full context has been consumed. The user encounters this in real time: extraction fields stream into a structured form alongside the embedded PDF as the document is read, red flags appear once analysis completes, and clicking any field navigates the PDF viewer to the cited page with best-effort source highlighting. The analyst's authoritative role is verification: every field can be accepted as-is, overridden with a mandatory short justification, or constrained to a closed vocabulary for taxonomy-bound fields; the locked case carries the analyst's terminal decision (Approve / Reject / Escalate) alongside the model's evidence and the human's overrides.

What the rule explicitly does NOT do (boundary clarifications for the PRD): cross-document synthesis, ownership-graph traversal across separate filings, sanctions-/PEP-list cross-referencing (legacy KYC tools already do this and ClearKYC does not displace them), and deterministic-pipeline guarantees (the rule is model-driven and lossy by design — the analyst is the decision-maker, not the model).

## Non-Functional Requirements

- **Streaming responsiveness:** the first streamed extraction field is visible to the analyst within 5 seconds of triggering analysis on a representative 50-page B2B PDF. (Mechanism — transport, model choice, partial-parse strategy — is downstream.)
- **Citation-click responsiveness:** clicking an extracted field resolves to the cited page in the embedded PDF viewer within 500 ms of the click on a representative document. Best-effort text-span highlight follows on the same page; failure to highlight does not block the navigation budget.
- **Data containment:** no document content or extracted PII leaves operator-accessible storage after the case is finalized, beyond the retained finalization audit record (which is itself subject to a defined retention + redaction policy — see Open Question 2). The model provider's data-handling posture is part of this commitment (Open Question 3).
- **Trust-contract integrity:** every populated field shown in the UI is justifiable — either by an array of verbatim source citations, or by an explicit "Not Disclosed / Inferred Missing" marker plus its derived red-flag entry. The product never shows a confident value without provenance.
- **Auditability of decision:** the locked finalization record is reproducible — re-rendering the JSON export for the same case_id returns byte-identical content to what the analyst saw at lock time.

## Non-Goals

- **No multi-document cross-referencing / RAG across separate filings.** v1 is one PDF per case; cross-document synthesis (ownership chains spanning multiple corporate filings) is v2 territory. Rationale: building cross-document reasoning before the single-document UX is proven inverts the risk profile of the MVP.
- **No real-time multi-analyst collaboration.** No shared cursors, no presence, no concurrent editing of the same case. One analyst per case per session. Rationale: collaborative editing is a substantial UX surface that distracts from the single-analyst verification loop the product is trying to prove.
- **No reviewer / approver / admin roles.** Flat single-role model in v1 (locked in Phase 2). Rationale: role-based workflow (analyst → reviewer → sign-off) is the natural v2 evolution but doubles the surface area for v1.
- **No case queue or case-backlog management UI.** v1 handles one case at a time. No multi-case dashboard, no triage queue, no workload analytics. Rationale: queue management is a separate product surface that the design-partner bank already has elsewhere.
- **No formatted PDF report generation (v2 nice-to-have).** v1 emits machine-readable JSON only (FR-012). Rationale: a formatted PDF generator is engineering-heavy and not on the trust-building critical path.
- **No bank SSO integration in v1 (v2 parallel workstream).** v1 ships with the managed-IdP shape from FR-001; the configuration-only upgrade to SAML/OIDC is v2. Rationale: avoid blocking the MVP on a multi-week bank infosec review cycle.
- **No per-edit append-only audit logging.** v1 records one finalization audit record per case (FR-013), bundling all override justifications. Rationale: per-edit logging without commit-on-blur produces noise; an immutable PII ledger without retention/redaction is a GDPR risk.

## Quality cross-check

Ran 2026-05-18. All six elements present; no gaps. quality_check_status: accepted.

- Access Control: present — managed IdP for v1, SSO target end-state for v2, finalization audit, no public sign-up.
- Business Logic: present — one declarative sentence captured; supporting paragraphs explain inputs, outputs, and the user encounter.
- Project artifacts: present — full frontmatter (incl. product_type, target_scale, timeline_budget, context_type), checkpoint, 12 FRs each with a Socrates blockquote, US-01 with acceptance criteria.
- Timeline-cost acknowledgment: present — mvp_weeks=6 with `## Timeline acknowledgment` block; user accepted the sustained-effort cost after un-scoping click-to-highlight back into v1.
- Non-Goals: present — 7 explicit entries covering multi-doc, multi-analyst collab, roles, queue UI, formatted PDF report, v1 SSO, per-edit audit.
- Preserved behavior: n/a (greenfield).

Notable items for `/10x-prd` to surface:
- Open Question 1 (red-flag taxonomy) is `Block: yes`. The PRD will land with an explicit blocker; this is expected, not a defect.
- The Phase-2 "every action audited" framing was narrowed in Phase 4 (Socrates batch 4) to finalization-only logging; the walk-back is recorded in `gray_areas_resolved` and reflected consistently in Access Control, Success Criteria guardrails, and FR-013.
