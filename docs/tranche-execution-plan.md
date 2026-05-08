# Vibecodeplus Master Tranche Execution Plan

**Program version:** 1.0  
**Prepared for:** Vibecodeplus 1000+ validated-fix reliability initiative  
**Baseline date:** Friday, May 8, 2026  
**Execution start target:** Monday, May 11, 2026

---

## 1) Mission and non-negotiables

Deliver **at least 1000 validated fixes** (target: **1050+**) while hardening reliability first:

- **P0/P1-first** sequencing is mandatory.
- **Source-preserving deterministic migration** is mandatory.
- **Exactly-once chat terminal semantics** are mandatory.
- **Contract-safe payload handling** is mandatory.
- **Watcher/SSH loop containment** is mandatory.
- **Workspace/Dialogs/Chat consistency rewrite** is mandatory.

No tranche may proceed if blocking gate criteria fail.

---

## 2) Program success metrics

### Primary outcomes

1. **Validated fixes landed:** >=1000 (target 1050+)  
2. **P0 open issues:** 0 before exiting Tranche 1  
3. **P1 closure before RC:** >=95% before Tranche 5 RC  
4. **Checkpoint completion:** CP-01 through CP-48 all passed  
5. **Canary health:** 48h with no Sev0/Sev1

### Reliability KPIs (must trend down during rollout)

- Duplicate stream finalize rate
- Watcher forbidden-loop incident rate
- Migration failure/fallback rate
- Dialog state-transition failure rate
- WS reconnection duplication rate

---

## 3) Validated-fix counting standard (strict)

A fix only counts when all artifacts exist:

1. **Case ID** (from 200-case matrix or approved expansion case)
2. **Root cause note**
3. **Code delta** (PR link)
4. **Automated test evidence** (unit/integration/e2e/chaos/fuzz/soak as applicable)
5. **Telemetry confirmation** in next tranche window

If any artifact is missing, fix remains **"implemented-not-validated"** and does not count toward the 1000 threshold.

---

## 4) Issue-factory operating model

## 4.1 Required labels

- Priority: `P0-crash`, `P0-data-loss`, `P1-reliability`, `P1-ux-state`, `P2-polish`
- Subsystem: `auth`, `projects`, `continuation`, `chat`, `files`, `watcher`, `ssh`, `ws`, `ui-dialogs`, `workspace`, `editor`, `preview`, `terminal`, `backups`, `observability`, `tests`
- Tranche: `T0` to `T5`
- Status: `triaged`, `in-progress`, `in-review`, `merged`, `validated`, `blocked`

## 4.2 Mandatory issue fields

- Repro steps
- Expected result
- Actual result
- Impact and severity
- Subsystem + owning squad
- Test mapping (case IDs)
- Rollback impact
- Telemetry signal to watch

## 4.3 Evidence checklist (PR template block)

- [ ] Case ID(s)
- [ ] Root cause summary
- [ ] Contract/risk category
- [ ] Feature flag impact
- [ ] Tests added/updated
- [ ] Telemetry dashboard link
- [ ] Rollback note

---

## 5) Workstream topology and ownership

| Workstream | Scope | Primary owner role | Secondary owner role |
|---|---|---|---|
| WS-A Contracts & Error Codes | server/client payload guards, envelopes, error registry | Backend Lead | QA Lead |
| WS-B Migration Determinism | migrations, aliases, continuation FSM | Backend Lead | DBA/Platform |
| WS-C Watcher/SSH Containment | watcher FSM, lease IDs, singleflight, stale rejection | Infra Lead | Backend Lead |
| WS-D Chat Exactly-Once | stream FSM, sequence discipline, persistence idempotency | Chat Lead | Backend Lead |
| WS-E Workspace & Dialog Rewrite | unified state machines, deterministic dialog flow | Frontend Lead | UX Lead |
| WS-F Test/Chaos/Fuzz/Soak | matrix automation, randomized ordering, durability | QA Lead | SDET |
| WS-G Release/SRE | feature flags, canary, rollback drills | Release Manager | SRE |

---

## 6) Branch strategy and PR batching

## 6.1 Branch naming

- Tranche integration branches: `program/t0-foundations`, `program/t1-p0-closure`, ...
- Scoped feature branches: `feat/<tranche>/<subsystem>/<ticket-id>`
- Hotfix branch pattern: `hotfix/p0/<ticket-id>`

## 6.2 PR sizing and rules

- Target PR size: <= 600 LOC net for risky subsystems
- All high-risk PRs behind flags:
  - `migration_v2`
  - `watcher_fsm_v2`
  - `stream_fsm_v2`
- No mixed concerns in one PR (e.g., stream FSM + dialog rewrite forbidden)
- Require 2 approvals for P0/P1 touching auth/migration/chat

## 6.3 Batch cadence

- **Daily:** 3 merge windows (10:30, 14:30, 18:00 local)
- **Nightly:** full regression + chaos smoke
- **Weekly:** tranche checkpoint audit and metric sign-off

---

## 7) Tranche plan (deliverables and quotas)

## T0 Foundations (Week 1)

**Quota target:** 80 validated fixes (mostly infra + guardrails)  
**Exit gate:** CP-01..CP-05, CP-37 complete

Deliverables:

- Issue-factory workflow live
- Error code registry + client error map scaffold
- Contract modules (`server/contracts/*`, `client/lib/contracts.ts`)
- Structured correlation (`request_id`, `project_id`, `stream_id`, `migration_id`)
- Test harness bootstrap (unit/integration/e2e/chaos/fuzz/soak directories and runners)

## T1 P0 Closure (Weeks 2-3)

**Quota target:** 180+ validated fixes  
**Exit gate:** P0 open count = 0, CP-06..CP-10, CP-44 complete

Deliverables:

- Route payload hardening for projects/continuation/chat/files/auth
- Deterministic 4xx/5xx envelope behavior
- Eliminate unsafe nested access class globally
- Contract-fuzz baseline for all route families

## T2 Migration + Watcher/SSH Reliability (Weeks 4-5)

**Quota target:** 420+ validated fixes cumulative in P1 reliability class  
**Exit gate:** CP-11..CP-21 complete

Deliverables:

- New tables: `project_migrations`, `project_aliases`
- Migration stage FSM + source preservation default
- Alias resolution for project-scoped APIs
- Watcher FSM + forbidden quarantine + remap flow
- SSH lease IDs + stale callback rejection + singleflight acquire

## T3 Chat Determinism (Week 6)

**Quota target:** +160 validated fixes (chat/server/client synchronization)

**Exit gate:** CP-22..CP-28 complete

Deliverables:

- `stream_id` + monotonic `sequence` on stream events
- Exactly-once terminal state finalize guard
- Exclusive terminal statuses (`complete`, `cut_off`, `empty`, `error`, `aborted`)
- Tool-call binding and duplicate assistant-row prevention

## T4 Workspace/Dialogs/Chat UX Rewrite (Weeks 7-8)

**Quota target:** +210 validated fixes (state coherence and UX consistency)  
**Exit gate:** CP-29..CP-37 complete

Deliverables:

- Client state-machine-first orchestration
- Unified dialog lifecycle graph
- Deterministic workspace/connect/recover flows
- File tree/editor/autosave race fixes
- WS reconnect governance and stale handler rejection

## T5 Validation + RC + Release (Week 9)

**Quota target:** final >=1050 validated fixes  
**Exit gate:** CP-38..CP-48 complete

Deliverables:

- Full 200-case matrix green
- Chaos/fuzz/soak pass
- Rollback drill pass
- Release candidate and staged canary rollout

---

## 8) Day-by-day execution board (9-week plan)

> Start Monday **May 11, 2026**. Days are business days.

### Week 1 (T0)

- **Day 1 (May 11):** Stand up issue taxonomy, dashboards, PR templates, validated-fix rubric
- **Day 2 (May 12):** Create server/client contract scaffolds and error code registry skeleton
- **Day 3 (May 13):** Correlation ID plumbing in logger, API, WS events
- **Day 4 (May 14):** Seed test directories/runners; add first contract unit suites
- **Day 5 (May 15):** T0 gate review (CP-01..CP-05) and replan deficits

### Week 2 (T1)

- **Day 6:** Projects + auth routes guard parsing and envelope normalization
- **Day 7:** Continuation route unsafe access removal + deterministic 422 mapping
- **Day 8:** Files route path/body validation and typed error paths
- **Day 9:** Chat request validation hardening + malformed payload corpus v1
- **Day 10:** P0 triage closeout checkpoint and regression audit

### Week 3 (T1)

- **Day 11:** Remaining P0 crash/data-loss fixes
- **Day 12:** Systematic unsafe nested access eradication pass
- **Day 13:** Route contract coverage >90% critical routes
- **Day 14:** P0 re-verification + telemetry clean window
- **Day 15:** **Hard gate:** P0 must equal zero (CP-44)

### Week 4 (T2)

- **Day 16:** Add DB migrations (`project_migrations`, `project_aliases`, indexes)
- **Day 17:** Implement migration stage machine service and idempotent retries
- **Day 18:** Canonical alias resolver integrated into project-scoped APIs
- **Day 19:** Source preservation policy enforcement and retention checks
- **Day 20:** Migration integration suite + failure-path validation

### Week 5 (T2)

- **Day 21:** Watcher FSM state model + persistence and events
- **Day 22:** Forbidden loop breaker + cooldown/quarantine semantics
- **Day 23:** Watcher remap orchestration source->target
- **Day 24:** SSH lease IDs + stale callback guards + singleflight refresh
- **Day 25:** T2 gate review (CP-17..CP-21), chaos storm tests

### Week 6 (T3)

- **Day 26:** Stream FSM server service + terminal exclusivity model
- **Day 27:** `stream_id` + `sequence` propagation through WS and persistence
- **Day 28:** Exactly-once finalize CAS guard and duplicate suppression
- **Day 29:** Client reducer updates for stream affinity and monotonic acceptance
- **Day 30:** Chat matrix verification (101-140) and CP-22..CP-28 sign-off

### Week 7 (T4)

- **Day 31:** Workspace machine scaffold and store ownership normalization
- **Day 32:** Dialog machine implementation (`none -> key_recovery -> continuation -> credits -> done`)
- **Day 33:** Chat panel/input/bubble deterministic terminal-state UX
- **Day 34:** File tree and editor race-condition hardening + autosave cancel safety
- **Day 35:** WS reconnect bounded policy and stale handler cleanup

### Week 8 (T4)

- **Day 36:** Dashboard/workspace consistency pass + badges and migration status surfacing
- **Day 37:** Terminal/preview/dialog UX typed errors and deterministic recovery actions
- **Day 38:** Accessibility and keyboard/focus trap conformance in dialog stack
- **Day 39:** E2E journey stabilization and flake elimination
- **Day 40:** T4 gate checkpoint sign-off (CP-29..CP-37)

### Week 9 (T5)

- **Day 41:** Run full unit + integration + e2e matrix
- **Day 42:** Chaos/fuzz corpus expansion and reruns
- **Day 43:** 24h watcher soak and 8h chat soak execution
- **Day 44:** Rollback drill (DB + feature flags + release artifacts)
- **Day 45:** RC go/no-go, 5% canary deploy, start 48h canary clock

---

## 9) 48-checkpoint ownership map

| Checkpoint range | Owner workstream | Required artifact |
|---|---|---|
| CP-01..CP-05 | WS-A + WS-G | taxonomy dashboard, contracts scaffold, unsafe access audit report |
| CP-06..CP-10 | WS-A | route contract test pass + deterministic 422/4xx evidence |
| CP-11..CP-16 | WS-B | DB migration scripts, alias resolver tests, idempotency proofs |
| CP-17..CP-21 | WS-C | watcher/ssh FSM tests + forbidden-loop incident metrics |
| CP-22..CP-28 | WS-D | stream FSM tests + duplicate finalize rate report |
| CP-29..CP-37 | WS-E | state machine integration tests + UX deterministic path evidence |
| CP-38..CP-43 | WS-F | coverage report, green suites, chaos/fuzz/soak summaries |
| CP-44..CP-48 | WS-G | burn-down report, rollback drill logs, RC + canary approval |

---

## 10) Validation accounting model

To prevent inflated counts:

- One fix can map to multiple cases, but **counted fixes remain unique issue IDs**.
- Reopened issue invalidates counted status until re-validated.
- Any post-merge Sev1 regression marks all related fixes as probation until telemetry passes.

### Minimum tranche validated counts

- T0: >=80
- T1: >=180 (P0 complete)
- T2: >=420 cumulative P1 reliability fixes
- T3: >=160
- T4: >=210
- T5: remainder to >=1050 total

---

## 11) Risk controls

1. **Feature flag all risky rewrites** (migration/chat/watcher)
2. **Parallel-run mode** where feasible (legacy and v2 execution shadowing)
3. **Kill switches** for migration aliasing, stream FSM v2, watcher FSM v2
4. **No-schema-change merges without rollback script prepared**
5. **Nightly telemetry review** during T2-T5

---

## 12) Definition of done (program level)

The program is complete only when:

- 48/48 checkpoints passed
- >=1000 validated fixes (target >=1050 achieved)
- P0 = 0 and P1 >=95% resolved pre-RC
- 200-case matrix fully executed with green gates (or approved waiver log)
- rollback runbook drill completed successfully
- canary passes 48h without Sev1/Sev0

---

## Appendix A: Required new artifacts

- `server/contracts/cli.ts`
- `server/contracts/routes.ts`
- `server/contracts/events.ts`
- `server/services/migrationService.ts`
- `server/services/streamStateMachine.ts`
- `server/services/watcherStateMachine.ts`
- `server/state/migrations.ts`
- `server/state/projectAliases.ts`
- `server/lib/errorCodes.ts`
- `server/lib/correlation.ts`
- `client/src/state-machines/chatStreamMachine.ts`
- `client/src/state-machines/workspaceMachine.ts`
- `client/src/state-machines/dialogMachine.ts`
- `client/src/lib/contracts.ts`
- `client/src/lib/errorMap.ts`
- `tests/unit/**`
- `tests/integration/**`
- `tests/e2e/**`
- `tests/chaos/**`
- `tests/fuzz/**`
- `tests/soak/**`

---

## Appendix B: 200-case matrix reference

Canonical matrix and per-case ownership are tracked in `docs/release-gates.md`.
