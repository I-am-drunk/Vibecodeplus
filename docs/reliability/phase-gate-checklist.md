# Vibecodeplus Phase Gate Checklist

Use this checklist at every phase boundary (0->1, 1->2, ... 7->8).

---

## Gate metadata
- **From phase:**
- **To phase:**
- **Date:**
- **Program lead:**
- **QA lead:**
- **SRE lead:**

## 1) Entry criteria verification

- [ ] Previous phase exit criteria fully satisfied
- [ ] No open blockers carried without waiver
- [ ] Risk register updated in last 5 business days
- [ ] Backlog prioritized using approved rubric

## 2) Quality and reliability checks

- [ ] Open P0 count = 0
- [ ] Open P1 count = 0 (or approved waiver with owner/date)
- [ ] Reliability SLIs stable or improving vs baseline
- [ ] Regression trend not increasing for 5 consecutive business days

## 3) Test and chaos readiness

- [ ] Required unit/integration suites green
- [ ] Chaos matrix scenarios for current phase green
- [ ] Required new tests added for all closed P0/P1
- [ ] Test evidence linked to closure tickets

## 4) Observability and diagnosability

- [ ] Correlation IDs present for all critical flows touched this phase
- [ ] Error envelope normalization confirmed
- [ ] Dashboards updated to include new metrics/state transitions

## 5) Rollback readiness

- [ ] Feature flags documented and toggle-tested
- [ ] Rollback drill executed in staging for touched systems
- [ ] DB snapshot restore test completed if schema/data changed
- [ ] Incident communication template prepared

## 6) Security and data integrity

- [ ] No data-destructive behavior without integrity verification
- [ ] Auth/API-key lifecycle behavior validated in failure modes
- [ ] Sensitive data handling reviewed for touched modules

## 7) UX/a11y checks (for client-impacting phases)

- [ ] Keyboard-only flow pass for impacted workflows
- [ ] Focus management verified in dialogs/custom controls
- [ ] Axe critical violations = 0 for impacted pages
- [ ] Contrast and reduced-motion checks complete

## 8) Decision

- **Gate result:** GO / NO-GO
- **Conditions/waivers (if GO with conditions):**
- **Required actions before next gate:**
- **Signoffs:**
  - Program lead:
  - QA lead:
  - SRE lead:
