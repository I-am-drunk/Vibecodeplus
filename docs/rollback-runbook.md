# Vibecodeplus Rollback Runbook

**Version:** 1.0  
**Last updated:** May 8, 2026  
**Applies to:** migration_v2, stream_fsm_v2, watcher_fsm_v2, UI state-machine rewrite

---

## 1) Rollback objectives

1. Restore stable service state with minimal data-risk.
2. Preserve user data and source projects during rollback.
3. Disable risky features via flags before full version rollback.
4. Keep an auditable timeline of rollback decisions and outcomes.

---

## 2) Trigger conditions

Initiate rollback when one or more conditions occur:

- Sev0 or Sev1 incident tied to new tranche functionality
- Duplicate stream finalization above threshold for 15+ minutes
- Migration failure rate exceeds agreed threshold and cannot be mitigated quickly
- Watcher forbidden loops recur despite quarantine controls
- RC/canary gate fails with no viable hotfix in SLA window

---

## 3) Rollback levels

## Level A - Feature-flag rollback (preferred first action)

Disable only new behavior:

- `stream_fsm_v2=false`
- `migration_v2=false`
- `watcher_fsm_v2=false`

Use when data schema is still compatible and incident is behavior-only.

## Level B - Service rollback

Deploy previous stable server/client artifacts while preserving current DB.

Use when feature flags are insufficient or new code paths are too unstable.

## Level C - Schema rollback (highest risk)

Rollback DB schema changes using pre-tested down migrations.

Use only when schema-level defect is confirmed and Level A/B cannot restore safe behavior.

---

## 4) Required pre-rollback checks

1. Confirm incident commander assignment.
2. Snapshot current DB and auth/config files.
3. Export active migration and stream state tables for forensic audit.
4. Announce freeze on new deployments and migration jobs.
5. Record exact UTC start time and suspected change set.

---

## 5) Step-by-step rollback procedure

## 5.1 Immediate containment (0-15 minutes)

1. Enable incident mode and deployment freeze.
2. Flip kill-switch flags (Level A) for affected subsystem(s).
3. Stop new migration enactments and non-critical background jobs.
4. Verify user-impact metrics begin recovering.

**Success checkpoint:** impact curve drops within 10 minutes.

## 5.2 Artifact rollback (15-45 minutes)

If Level A insufficient:

1. Deploy last known-good server artifact.
2. Deploy last known-good client artifact.
3. Keep DB in read/write unless corruption risk is identified.
4. Re-run smoke checks:
   - auth/login status
   - projects list/open
   - chat send/stream/stop
   - file tree/list/read/write
   - terminal connect/disconnect

**Success checkpoint:** core user journeys pass smoke matrix.

## 5.3 Schema rollback (45-120 minutes; controlled)

Only if required and approved by incident commander + DB owner:

1. Place app into restricted mode (writes paused where needed).
2. Run tested down migration set for affected release.
3. Validate table/index integrity and row counts.
4. Restore compatibility flags to v1 paths.
5. Run migration/alias/stream consistency checks.

**Success checkpoint:** DB + service compatibility restored and smoke tests pass.

---

## 6) Data safety rules

- Never delete source project data during incident response.
- Preserve `project_migrations` and `project_aliases` snapshots before schema mutation.
- Preserve stream event and terminal-state logs for replay analysis.
- Prefer additive hotfixes and flag fallback over destructive table rewrites.

---

## 7) Verification matrix after rollback

Run and record pass/fail for:

1. Auth status and key rotation sanity
2. Project list/open (including alias old->new resolution behavior)
3. Continuation status endpoint response validity
4. Watcher start/stop and forbidden behavior stability
5. SSH acquire/singleflight behavior
6. Chat streaming terminal-state correctness
7. UI dialog transitions and workspace load path

If any item fails, continue incident mitigation and do not clear freeze.

---

## 8) Communication protocol

- **T+0:** Incident declared, rollback level selected
- **T+15:** Containment update
- **T+45:** Artifact rollback status update
- **T+90:** Schema rollback status update (if used)
- **Resolution:** Publish summary + customer impact + next actions

All updates include:

- Current rollback level
- Affected subsystem(s)
- User-facing impact
- ETA to next checkpoint

---

## 9) Post-rollback actions (mandatory)

1. Create incident report within 24 hours.
2. Link failing case IDs and missed checkpoints.
3. Add or expand regression tests for escaped defect.
4. Run rollback drill retrospective and update this runbook.
5. Require explicit re-entry criteria before re-enabling v2 flags.

---

## 10) Rollback drill acceptance checklist

- [ ] Drill executed end-to-end in non-prod
- [ ] Time-to-containment within SLA
- [ ] Level A/B/C decision points documented
- [ ] Data preservation verified
- [ ] Smoke matrix passed after rollback
- [ ] Stakeholder communications logged
- [ ] Runbook updates committed

Passing this checklist satisfies checkpoint **CP-46**.
