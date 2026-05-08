# Vibecodeplus Reliability + UX Uplift Master Plan (Execution Ready)

- **Status:** Approved-for-execution draft
- **Version:** 1.0.0
- **Prepared:** 2026-05-08
- **Program window:** 16 weeks (2026-05-11 to 2026-08-28)
- **Target release:** Ring 3 GA starting 2026-09-07 if all gates pass
- **Scope:** End-to-end hardening of backend/frontend reliability-critical paths + major UX/a11y uplift

---

## 1) Program charter

### 1.1 Objective
Deliver a controlled reliability program that:
1. Identifies and closes **>=550 unique defects** (program budget: **665 fixes**).
2. Eliminates known crash/retry-loop classes in critical flows.
3. Ships deterministic stream/workspace lifecycle behavior.
4. Delivers a major UI/UX and accessibility uplift with keyboard-complete workflows.
5. Releases via canary rings with enforced rollback readiness.

### 1.2 Non-negotiable constraints
- No production release promotion without passing every hard gate in Section 11.
- No data-destructive continuation path before transfer verification + checksum integrity.
- No unvalidated external JSON crossing trust boundaries after Phase 1 completion.
- No auto-retry storm behavior (watcher/SSH/WS) after Phase 4 completion.

### 1.3 Out of scope
- New user-facing feature families not required for reliability/a11y uplift.
- CI pipeline redesign unrelated to this program.
- Multi-tenant architecture changes (application remains local single-user model).

---

## 2) Definitions and counting rules (eliminate ambiguity)

### 2.1 What counts as a “fixed issue”
A defect counts only when all are true:
1. Unique backlog ID exists.
2. Root cause is documented.
3. A reproducible test (automated or deterministic manual script) is attached.
4. A code change, config change, or explicit no-code remediation is merged.
5. Verification evidence is attached (test output, screenshot, log trace).
6. Linked regression guard exists (test/assertion/monitor).

### 2.2 Deduplication rule
- Multiple reports mapping to same root cause = **1 fixed issue** + linked duplicates.
- One report containing multiple root causes = split into separate IDs.

### 2.3 Severity classes
- **P0:** Data loss/security/completed workflow impossible/crash loop.
- **P1:** Critical workflow degraded or unreliable.
- **P2:** Workflow friction or medium reliability risk.
- **P3:** Cosmetic/minor or low-frequency defect.

---

## 3) Prioritization model and SLA

## 3.1 Priority score formula

`Priority Score = (Severity*5) + (Frequency*4) + (Impact*5) + ((6-Recoverability)*3) + (BlastRadius*4)`

Each factor scored 1..5.

### 3.2 Priority bands + SLA
- **P0 (score >= 85):** immediate hotfix; blocks release; acknowledge < 30 min, mitigation < 4h.
- **P1 (70–84):** same active phase; release-blocking.
- **P2 (50–69):** scheduled within cycle; not GA-blocking unless trend worsens.
- **P3 (<50):** opportunistic after stabilization.

### 3.3 Tie-breaker sequence
If two items have equal score, prioritize by:
1. data integrity risk,
2. customer-visible workflow block,
3. blast radius,
4. ease of safe rollback.

---

## 4) Workstream budgets (minimum closure target)

Planned closure budget is intentionally oversized to avoid under-delivery.

| Workstream | Budget |
|---|---:|
| Auth/API key lifecycle + session safety | 70 |
| Continuation + key-mismatch migration | 65 |
| CLI contract parsing + runtime validation | 55 |
| Chat stream state machine (server) | 60 |
| Chat stream state machine (client) | 45 |
| WS resilience + message contracts | 40 |
| SSH manager + watcher + tunnel hardening | 65 |
| File ops/editor/autosave consistency | 40 |
| Backup/snapshot/restore reliability | 45 |
| DB/config migration and data integrity | 30 |
| UI/UX overhaul + accessibility remediation | 80 |
| Observability + tests + chaos + release gates | 70 |
| **Total** | **665** |

Program **Definition of Done** requires closure of at least **550 verified issues** and **0 open P0/P1**.

---

## 5) Program governance model

### 5.1 Roles (RACI)
- **Program Lead (A):** owns phase transitions, risk decisions, gate signoff.
- **Backend Lead (R):** server routes, CLI, SSH, watcher, DB hardening.
- **Frontend Lead (R):** workspace/chat/store/UI/a11y hardening.
- **QA/Resilience Lead (R):** test harness, chaos suite, defect verification.
- **SRE/Release Lead (R):** canary ringing, rollback drills, observability.
- **Security reviewer (C):** auth and key lifecycle checks.
- **Product owner (C/I):** acceptance alignment and UX signoff.

### 5.2 Cadence
- Daily 15-min triage + blocker review.
- 2x weekly defect burn-down review.
- Weekly phase readiness review with go/no-go decision.
- Every Friday: risk register refresh + rollback readiness check.

### 5.3 Required artifacts every week
- Updated issue closure count by workstream and priority.
- P0/P1 aging report.
- Reliability trend dashboard.
- Chaos suite pass-rate summary.
- Open migration/data-integrity risks.

---

## 6) Phase plan (0–8) with explicit gates and rollback

## Phase 0 — Baseline + observability foundation
- **Dates:** 2026-05-11 to 2026-05-22
- **Goal:** measure before changing behavior.

### Entry criteria
- Backlog tool configured with required fields (Section 2).
- Critical flow map approved.

### Work packages
1. Canonical bug taxonomy + tags.
2. Correlation ID propagation across HTTP, WS, CLI calls, stream IDs.
3. Baseline dashboards: error rate, stream success, workspace-open success, MTTR.
4. Feature-freeze policy activated (except reliability fixes).

### Exit criteria
- 100% of critical routes/events emit correlation IDs.
- Baseline metrics captured for 7 days.

### Rollback
- `observability.strict=false` disables extra instrumentation fields while preserving existing logs.

---

## Phase 1 — Runtime validation and normalized error contracts
- **Dates:** 2026-05-25 to 2026-06-12
- **Goal:** eliminate trust-boundary shape assumptions.

### Work packages
1. Add runtime validators for every external payload (CLI output, route input, WS inbound).
2. Add shared error envelope shape:
   - `code`
   - `message`
   - `correlationId`
   - `retryable`
   - `details`
3. Replace unsafe `any` at trust boundaries with parse results.
4. Add malformed-payload fuzz tests for high-risk routes.

### Mandatory direct fix
- In continuation verification path, eliminate `.some` on unknown shape:
  - parse project list through safe parser returning guaranteed array.
  - malformed payload -> deterministic typed error (no crash).

### Exit criteria
- 0 unguarded JSON trust boundaries in scoped files.
- Malformed payload suite passes.

### Rollback
- `validation.mode=warn` allows degraded compatibility while collecting violations.

---

## Phase 2 — Continuation migration safety and API-key mismatch convergence
- **Dates:** 2026-06-15 to 2026-06-26
- **Goal:** make continuation deterministic and non-destructive.

### Work packages
1. Consolidate mismatch logic into single server decision engine.
2. Enforce migration transaction semantics:
   1) create target project,
   2) verify existence with validated list,
   3) transfer snapshot + checksum manifest,
   4) archive/delete source only after verified integrity.
3. Add continuation status endpoint with versioned contract.
4. Add explicit partial-failure recovery and retry-safe idempotency tokens.

### Exit criteria
- No source deletion prior to verified transfer integrity.
- Full continuation matrix passes (success, auth fail, sandbox unavailable, partial transfer).

### Rollback
- `continuation.preserveSource=true` emergency mode keeps source project unconditionally.

---

## Phase 3 — Deterministic stream FSM (server + client)
- **Dates:** 2026-06-29 to 2026-07-17
- **Goal:** remove boolean drift and event-order corruption.

### Canonical states
`IDLE -> STARTING -> STREAMING -> COMPLETING -> COMPLETED`

Error/terminal states:
`CUT_OFF`, `ERROR`, `ABORTED`, `CREDITS_EXHAUSTED`

### Work packages
1. Shared stream event schema with sequence numbers.
2. Transition guards rejecting illegal transitions.
3. Durable logging of transition history for replay diagnostics.
4. Client merge logic resilient to duplicate/out-of-order events.

### Exit criteria
- Illegal transition count = 0 in replay tests.
- Out-of-order/duplicate event scenarios do not corrupt UI state.

### Rollback
- `stream.fsm.legacyCompat=true` falls back to prior handler for one ring.

---

## Phase 4 — Watcher/Forbidden loop + SSH circuit breaker hardening
- **Dates:** 2026-07-20 to 2026-07-31
- **Goal:** eliminate retry storms and cascading reconnect loops.

### Work packages
1. Watcher FSM: `RUNNING`, `PAUSED`, `BLOCKED`, `STOPPED`.
2. Forbidden/auth failures transition watcher to `BLOCKED` with suppression window.
3. Bounded retry with jitter and max-attempt budget.
4. Decouple WS reconnect from watcher restart cascades.
5. SSH manager circuit breaker with cooldown and half-open probing.

### Exit criteria
- No recurring Forbidden polling storm under chaos simulation.
- CPU/network behavior stable under repeated auth failures.

### Rollback
- `watcher.autoStart=false` manual restart only.

---

## Phase 5 — File, autosave, backup, snapshot integrity
- **Dates:** 2026-08-03 to 2026-08-14
- **Goal:** protect data correctness under interruptions.

### Work packages
1. Atomic write strategy (temp+fsync+rename where supported).
2. Centralized path sanitization and shell escaping.
3. Autosave conflict detection + deterministic merge policy.
4. Backup manifest with checksums/file counts.
5. Snapshot recursion limits and binary-safe inclusion policy.

### Exit criteria
- Interrupted-write corruption tests pass.
- Restore integrity validated via checksum reconciliation.

### Rollback
- `backup.mode=manual_only` if integrity regressions observed.

---

## Phase 6 — UI/UX and accessibility uplift
- **Dates:** 2026-08-17 to 2026-08-28
- **Goal:** consistent state model + accessible interaction design.

### Work packages
1. Replace implicit globals (e.g., ambient window fields) with typed store state.
2. Standard modal/dialog orchestration.
3. Keyboard and focus behavior for all key workflows.
4. ARIA roles/labels/states for custom controls.
5. Color contrast and reduced-motion support.
6. Replace native `alert/confirm/prompt` flows with accessible dialogs.

### Exit criteria
- Axe critical violations = 0 for key pages.
- Lighthouse accessibility score >=95 on core routes.
- Keyboard-only completion of top workflows.

### Rollback
- `ui.shell=classic` available through one release cycle.

---

## Phase 7 — Chaos campaign + closure burn-down to >=550
- **Dates:** 2026-08-31 to 2026-09-11
- **Goal:** prove resilience at system level and hit closure targets.

### Work packages
1. Run full fault-injection matrix daily.
2. Burn down remaining P2/P3 while preserving P0/P1=0.
3. Enforce evidence-linked closure.

### Exit criteria
- >=550 verified closed issues.
- P0/P1 open count = 0.
- Chaos pass >=95%.

### Rollback
- Freeze promotion and revert to last stable ring artifact.

---

## Phase 8 — Release hardening + canary -> GA
- **Dates:** 2026-09-14 onward
- **Goal:** controlled promotion through release rings.

### Rings
- Ring 0 internal
- Ring 1 opt-in canary
- Ring 2 staged
- Ring 3 GA

### Promotion rule
No ring promotion without passing all hard gates in Section 11 for at least 72h (for canary/staged).

### Rollback
1. Disable offending flags.
2. Revert artifact.
3. Restore DB snapshot if schema/data migrated.
4. Publish incident and recovery notes within 24h.

---

## 7) Detailed file-level execution checklist

Apply this checklist to every file in scoped list:
- [ ] Runtime input validation exists.
- [ ] External output validation exists.
- [ ] Errors use normalized envelope.
- [ ] Correlation IDs propagated and logged.
- [ ] Retry/backoff is bounded and jittered.
- [ ] No hidden global side effects.
- [ ] Accessibility semantics/focus behavior validated (UI files).
- [ ] Unit/integration tests added.
- [ ] Chaos case mapped.
- [ ] Rollback impact documented.

### Highest-priority file groups (must be completed first)
1. `server/routes/continuation.ts` — transaction-safe continuation + payload guards.
2. `server/routes/projects.ts` — canonical workspace-open mismatch decisions.
3. `server/ssh/watcher.ts` — BLOCKED state and retry suppression.
4. `server/cli/wrapper.ts` — strict parse and stream event contract.
5. `server/routes/chat.ts` + `client/src/hooks/useProjectEvents.ts` — FSM alignment.
6. `client/src/pages/Workspace.tsx` + dialog components — deterministic UI flow + a11y.
7. `client/src/lib/api.ts` — strict typed error contract.

---

## 8) Workstream implementation specifics

## 8.1 Runtime contracts and validation
- Introduce shared validator modules for:
  - route params/body/query,
  - CLI response envelopes,
  - WS inbound events,
  - persisted JSON config structures.
- Reject unknown enum states in stream/watcher/continuation payloads.
- Add tolerant parser + strict mode switch for staged rollout.

## 8.2 Continuation and migration integrity
- Use idempotency key per migration attempt.
- Persist migration stages (`INIT`, `TARGET_CREATED`, `SNAPSHOT_TRANSFERRED`, `VERIFIED`, `SOURCE_ARCHIVED`).
- Resume from last safe stage on restart.
- Hard-stop deletion if checksum mismatch or incomplete manifest.

## 8.3 Streaming FSM alignment
- Create transition table shared by server/client tests.
- Persist last sequence number per stream.
- Drop stale events and log with reason.
- Terminalization rules:
  - terminal state accepted once,
  - subsequent terminal events ignored and logged.

## 8.4 Watcher and SSH resilience
- Circuit breaker parameters:
  - open threshold: N failures/interval,
  - cooldown window,
  - half-open single probe,
  - auto-close on success.
- Blocked project queue with manual unblock action + TTL.

## 8.5 File/autosave/backup
- Writes use optimistic concurrency version token.
- Autosave conflict dialog offers:
  - keep local,
  - accept remote,
  - manual merge preview.
- Backup metadata includes version, manifest hash, capture timestamp.

## 8.6 UX and accessibility standards
- Every interactive element has semantic role, accessible name, visible focus.
- Dialogs trap focus, restore origin focus on close, support Escape (except destructive confirm flows requiring explicit action).
- Color tokens meet WCAG AA minimum for text and controls.
- Motion-heavy transitions disabled under reduced-motion preference.

---

## 9) Chaos/fault-injection matrix (minimum required)

| Fault injected | Target | Expected behavior |
|---|---|---|
| Malformed CLI JSON | CLI wrapper + routes | Validation error, no crash, actionable error envelope |
| `listProjects` wrong shape | continuation verify | safe fallback, no `.some` crash |
| API key rotates mid-stream | chat/auth/streams | graceful stream abort + recovery CTA |
| Forbidden on watcher poll | watcher | transition to `BLOCKED`, no retry storm |
| SSH auth fail repeated | SSH manager | circuit opens, cooldown, controlled retry |
| WS disconnect mid-stream | client hooks | reconnect, dedupe events, no duplication |
| Out-of-order stream events | stream FSM | deterministic ordering, no double-complete |
| Corrupt/missing backup | restore | fail safe, preserve source |
| Partial snapshot transfer | continuation | source preserved, explicit operator warning |
| Autosave/remote race | files/editor | deterministic conflict resolution workflow |

Additional required chaos cases:
- disk full during snapshot capture,
- process restart mid-migration,
- delayed WS event burst after reconnect,
- stale token usage across tabs.

---

## 10) Test strategy and evidence requirements

### 10.1 Test layers
1. **Unit tests:** validators, FSM transitions, retry/circuit logic.
2. **Integration tests:** route-to-service and service-to-CLI/SSH boundaries.
3. **End-to-end tests:** workspace open, chat stream, continuation migration, backup restore.
4. **Chaos tests:** deterministic fault injections listed in Section 9.
5. **Accessibility tests:** axe scans + keyboard workflow scripts.

### 10.2 Coverage expectations
- 100% critical flow path coverage (route + service + state transition level).
- 90%+ branch coverage for FSM modules.
- 100% validator schema branch coverage for trust boundaries.

### 10.3 Evidence required per closed issue
- Repro steps (before),
- fix link,
- automated test reference,
- verification output/log,
- rollback note.

---

## 11) Hard release gates (must all pass)

1. **Quality gate**
   - 0 open P0/P1
   - >=550 verified closures
2. **Reliability gate**
   - stream success >=99.5%
   - workspace-open success >=99.0%
3. **Resilience gate**
   - chaos suite pass >=95%
4. **Accessibility gate**
   - key workflows keyboard-complete
   - axe critical violations = 0
5. **Observability gate**
   - 100% critical flows include correlation IDs
6. **Rollback gate**
   - rollback drill succeeded in staging and documented

Any single gate failure blocks ring promotion.

---

## 12) Release channels, feature flags, and rollback control

### 12.1 Release channels
- `stable`
- `canary`

### 12.2 Mandatory flags
- `validation.mode` (`strict|warn`)
- `stream.fsm.enabled`
- `watcher.circuitBreaker.enabled`
- `continuation.preserveSource`
- `ui.shell` (`classic|next`)

### 12.3 Rollback triggers
- newly introduced P0,
- sustained SLO breach >30 minutes,
- migration integrity failure,
- data corruption signal.

### 12.4 Rollback runbook
1. Freeze promotions.
2. Disable offending flag(s).
3. Revert to previous signed artifact.
4. Restore latest clean DB snapshot if needed.
5. Validate smoke suite.
6. Communicate incident + ETA + mitigation.

---

## 13) Critical SLO/SLI definitions

### 13.1 Stream success rate
`successful_streams / started_streams`
- success = stream reaches valid terminal non-error state.

### 13.2 Workspace-open success rate
`successful_workspace_opens / workspace_open_attempts`
- success = workspace fully interactive with files/chat readiness.

### 13.3 Continuation integrity rate
`verified_integrity_migrations / total_migrations`
- must remain 100% in release candidate period.

### 13.4 Watcher storm rate
`blocked_or_forbidden_retry_storm_incidents / active_projects`
- target = 0.

---

## 14) Execution board templates

## 14.1 Defect ticket template (required fields)
- ID
- Title
- Workstream
- Priority score components (Severity/Frequency/Impact/Recoverability/BlastRadius)
- Priority class (P0..P3)
- Root cause category
- Affected files/modules
- Repro steps
- Expected vs actual
- Fix strategy
- Test plan
- Rollback plan
- Evidence links

## 14.2 Daily status template
- Date
- Total closed (cumulative)
- Closed today by priority
- Open P0/P1 count + age
- Chaos pass-rate
- SLO trend deltas
- Top 3 blockers
- Decision requests

## 14.3 Phase gate checklist template
- Entry criteria met (Y/N)
- Exit criteria met (Y/N)
- Hard gate prechecks
- Rollback rehearsal status
- Signoff (Program Lead, QA Lead, SRE Lead)

---

## 15) Risks and mitigation actions

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Regression from rapid fix velocity | High | High | enforce validator/FSM-first ordering + mandatory tests |
| Continuation data loss | Medium | Critical | preserve-source default until verification complete |
| A11y uplift scope creep | High | Medium | component standards + strict page acceptance checklists |
| Hidden retry loops in rare paths | Medium | High | chaos injection + correlation-ID tracing |
| Insufficient test harness maturity | High | High | bootstrap tests in Phase 1 and block progression without it |

---

## 16) Program Definition of Done

Program is complete only when all statements are true:
1. **>=550 verified fixes** are closed with evidence and deduplication.
2. **0 P0/P1** remain open.
3. Reliability SLOs are met for **7 consecutive days** in staged/canary traffic.
4. Continuation mismatch and failure scenarios pass integrity checks.
5. No known runtime shape-assumption crashes remain in audited critical paths.
6. No watcher Forbidden retry storms observed.
7. UX refresh is released with a11y compliance and keyboard coverage.
8. Canary rollout completes and GA promotion is approved by all gate owners.

---

## 17) Initial execution order for the first 10 working days

1. Create backlog taxonomy and score all known defects.
2. Add correlation IDs to all critical routes and WS message handlers.
3. Implement validation wrappers for continuation/projects/chat entry points.
4. Fix unsafe continuation verification shape assumptions.
5. Add normalized error envelope in API and client parser.
6. Stand up FSM test harness skeleton (server + client).
7. Build watcher BLOCKED-state skeleton and retry budget controls.
8. Add chaos harness for malformed payload and Forbidden loop scenarios.
9. Start closure on top 20 P0/P1 defects by score.
10. Run first phase gate readiness review.

---

## 18) Appendix A — Scoped file map (from audit)

### Server
- `server/index.ts`
- `server/lib/logger.ts`
- `server/ws/hub.ts`
- `server/state/{db.ts,config.ts,auth.ts,streams.ts}`
- `server/cli/{wrapper.ts,types.ts}`
- `server/process/registry.ts`
- `server/routes/{auth.ts,projects.ts,chat.ts,files.ts,backups.ts,preview.ts,terminal.ts,settings.ts,continuation.ts}`
- `server/ssh/{manager.ts,watcher.ts,files.ts,tunnel.ts}`
- `server/continuation/capture.ts`
- `server/backup/coordinator.ts`

### Client
- `client/src/{main.tsx,App.tsx,index.css}`
- `client/src/pages/{Dashboard.tsx,Workspace.tsx,Settings.tsx,Login.tsx,Setup.tsx}`
- `client/src/store/{auth.ts,projects.ts,workspace.ts,chat.ts,continuation.ts}`
- `client/src/hooks/{useProjectEvents.ts,useChat.ts,useFiles.ts,useAutoSave.ts}`
- `client/src/lib/{api.ts,ws.ts,serverLogs.ts,utils.ts}`
- `client/src/components/workspace/*`
- `client/src/components/chat/*`
- `client/src/components/dialogs/*`
- `client/src/components/ui/*`
- `client/src/components/{CreditsBar.tsx,ErrorBoundary.tsx}`

### New modules expected
- `server/lib/validation.ts`
- `server/lib/errors.ts`
- `server/lib/fsm/*`
- `server/tests/**`
- `client/src/lib/validators.ts`
- `client/src/state/fsm/*`
- `client/src/tests/**`
- `client/src/a11y/**`

---

## 19) Appendix B — Explicit acceptance table by phase

| Phase | Must pass before phase close |
|---|---|
| 0 | Correlated logs on all critical flows; baseline dashboard captured |
| 1 | All trust boundaries validated; malformed payload tests passing |
| 2 | Source-preservation and migration integrity guaranteed |
| 3 | FSM deterministic under duplicate/out-of-order delivery |
| 4 | No retry storms; bounded backoff + circuit breaker operational |
| 5 | Atomic writes + restore integrity checks pass |
| 6 | A11y critical issues zero; keyboard workflow pass |
| 7 | >=550 verified closures and P0/P1=0 |
| 8 | Canary stable 72h and rollback drill proven |

---

## 20) Execution instruction

This plan is intended to be executable as written. If a conflict arises between implementation convenience and plan controls, the controls in Sections 1, 2, 6, 11, and 12 take precedence.
