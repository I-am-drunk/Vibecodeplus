# Vibecodeplus Issue Triage Template

Use this template for every defect ticket in the reliability program.

---

## 1) Metadata

- **Issue ID:**
- **Title:**
- **Date discovered:**
- **Reported by:**
- **Workstream:**
- **Affected environments:** local / ring0 / ring1 / ring2 / ring3
- **Affected versions/commit range:**

## 2) Priority scoring (required)

| Factor | Score (1-5) | Notes |
|---|---:|---|
| Severity |  |  |
| Frequency |  |  |
| Impact |  |  |
| Recoverability (inverse) |  |  |
| Blast Radius |  |  |

`Priority Score = (Severity*5) + (Frequency*4) + (Impact*5) + ((6-Recoverability)*3) + (BlastRadius*4)`

- **Computed score:**
- **Priority class (P0/P1/P2/P3):**

## 3) Functional description

- **Expected behavior:**
- **Actual behavior:**
- **User impact:**
- **Data integrity/security impact:**

## 4) Reproduction details

- **Preconditions:**
- **Steps to reproduce:**
  1.
  2.
  3.
- **Repro frequency:** always / intermittent / rare
- **Artifacts:** screenshot/log/correlation IDs

## 5) Root cause analysis

- **Root cause summary:**
- **Primary module/file(s):**
- **Contributing factors:**
- **Why existing tests did not catch it:**

## 6) Fix plan

- **Implementation approach:**
- **Validation/contract updates needed:**
- **FSM/state transition impact:**
- **Retry/backoff/circuit impact:**
- **A11y impact (if UI):**
- **Rollback strategy:**

## 7) Verification evidence (required for closure)

- **Automated test IDs/paths:**
- **Chaos scenario ID (if applicable):**
- **Manual verification script (if needed):**
- **Post-fix logs with correlation IDs:**
- **Before/after proof links:**

## 8) Closure checklist

- [ ] Unique root cause confirmed
- [ ] Regression guard added
- [ ] All relevant tests passing
- [ ] Evidence links attached
- [ ] Rollback notes included
- [ ] Duplicates linked (if any)
