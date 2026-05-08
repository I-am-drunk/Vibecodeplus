# Vibecodeplus Release Gates and Validation Matrix

**Version:** 1.0  
**Last updated:** May 8, 2026

This document defines go/no-go criteria for each tranche and the required 200-case validation matrix.

---

## 1) Global gate policy

1. **P0-first rule:** no tranche advancement with any open P0.
2. **Validated-only accounting:** fixes count only with evidence bundle.
3. **Feature-flag safety:** risky subsystems must support fallback.
4. **Rollback-ready requirement:** schema/lifecycle changes need tested rollback path.

---

## 2) Tranche go/no-go gates

## T0 Foundations gate

Required checkpoints: **CP-01..CP-05, CP-37**

Go criteria:

- Issue taxonomy active with mandatory fields
- Validated-fix rubric enforced in issue workflow
- Error code registry scaffolded
- Contract modules present for CLI/routes/events
- Unsafe nested access audit published
- Correlation IDs present in server logs and major request paths

No-go triggers:

- Missing error code map for any critical route
- No contract parser coverage for top-level route families

## T1 P0 Closure gate

Required checkpoints: **CP-06..CP-10, CP-44**

Go criteria:

- P0 open count = 0
- Deterministic payload rejection behavior on projects/continuation/chat/files/auth
- Standardized `{ code, message, details? }` error envelope

No-go triggers:

- Any crash-class payload-shape bug still reproducible
- Any unguarded `.data.*` access in critical route paths

## T2 Migration + Watcher/SSH gate

Required checkpoints: **CP-11..CP-21**

Go criteria:

- `project_migrations` + `project_aliases` tables live with tests
- Source-preserving migration semantics enforced
- Watcher FSM with forbidden quarantine operational
- SSH stale callback rejection and singleflight acquire operational

No-go triggers:

- Migration can delete source pre-validation
- Forbidden auth storms can loop indefinitely

## T3 Chat determinism gate

Required checkpoints: **CP-22..CP-28**

Go criteria:

- All stream events carry `stream_id` + monotonic `sequence`
- Exactly-once terminal finalization proven by tests and telemetry
- Mutually exclusive terminal states persisted and rendered

No-go triggers:

- Duplicate assistant message rows for same stream
- Terminal race reproductions still possible in deterministic tests

## T4 UX/state rewrite gate

Required checkpoints: **CP-29..CP-37**

Go criteria:

- Workspace state ownership unified
- Dialog lifecycle machine mutually exclusive and deterministic
- Chat controls/status rendering aligned to terminal state model
- WS reconnect bounded and duplicate-handler safe

No-go triggers:

- Dialog overlap races still reproducible
- Autosave writes after unmount/project-switch

## T5 RC + Release gate

Required checkpoints: **CP-38..CP-48**

Go criteria:

- Coverage floor met for critical modules (>=85%)
- Integration/e2e/chaos/fuzz/soak suites pass
- P1 resolved >=95% before RC
- Rollback drill complete
- Canary 48h without Sev1/Sev0

No-go triggers:

- Soak failures above threshold
- Rollback drill incomplete or non-deterministic

---

## 3) Checkpoint acceptance list (CP-01..CP-48)

| ID | Checkpoint | Acceptance criteria |
|---|---|---|
| CP-01 | Issue taxonomy live | All issues labeled P0/P1/P2 + subsystem |
| CP-02 | Validated-fix rubric | Counting blocked unless test+telemetry attached |
| CP-03 | Error code registry | 100% route errors mapped to code constants |
| CP-04 | Contract module scaffold | Validators exist for all CLI response families |
| CP-05 | Unsafe nested access audit | All `verify.data.projects.some` class paths removed |
| CP-06 | Projects route guarded parsing | Invalid payloads return deterministic 422 |
| CP-07 | Continuation route guarded parsing | No unchecked `.data.*` reads remain |
| CP-08 | Chat route guarded parsing | Stream events parsed via schema before use |
| CP-09 | File route contract checks | Invalid path/body rejected predictably |
| CP-10 | Auth route contract checks | rotate/login status envelopes standardized |
| CP-11 | DB migration table created | `project_migrations` present with indexes |
| CP-12 | Alias table created | `project_aliases` resolution tested |
| CP-13 | Source-preservation policy | source never deleted pre-validation |
| CP-14 | Mapping API | old->new canonical resolution endpoint works |
| CP-15 | Migration stage machine | all stage transitions audited + logged |
| CP-16 | Migration retry idempotency | rerun does not duplicate target artifacts |
| CP-17 | Watcher FSM | watcher states persisted and observable |
| CP-18 | Forbidden loop breaker | repeated forbidden enters quarantine |
| CP-19 | Stale watcher remap | post-migration watcher ownership transferred |
| CP-20 | SSH retry singleflight | duplicate acquire prevented |
| CP-21 | SSH stale callback rejection | old lease callbacks ignored |
| CP-22 | Stream ID added | every stream event includes `stream_id` |
| CP-23 | Sequence numbering | monotonic `sequence` enforced |
| CP-24 | Terminal status FSM | complete/cut_off/empty/error/aborted exclusive |
| CP-25 | Exactly-once finalize | no duplicate assistant messages per stream |
| CP-26 | Abort semantics | aborted produces only aborted terminal state |
| CP-27 | Empty semantics | empty distinct from error/cut_off in DB/UI |
| CP-28 | Tool-call binding | orphan tool calls = 0 across runs |
| CP-29 | Workspace state unification | no duplicate authoritative state holders |
| CP-30 | Dialog state machine | mutually exclusive dialog lifecycle validated |
| CP-31 | Key recovery determinism | rotation+resume flows deterministic |
| CP-32 | Continuation dialog correctness | status reflects backend stage machine |
| CP-33 | Chat panel consistency | retry/continue controls honor terminal state |
| CP-34 | FileTree race fix | no collapse/reset under refresh storms |
| CP-35 | Autosave safety | no writes after workspace unmount |
| CP-36 | WS reconnect policy | bounded backoff + no duplicate handlers |
| CP-37 | Correlation IDs | request->stream->db traceable |
| CP-38 | Unit test floor | 85%+ coverage in critical modules |
| CP-39 | Integration suite | migration/chat/watcher/auth suites green |
| CP-40 | E2E suite | core user journeys green |
| CP-41 | Chaos suite | randomized ordering tests green |
| CP-42 | Fuzz suite | malformed payload corpus green |
| CP-43 | Soak 24h | no memory leak/regression threshold breach |
| CP-44 | P0 burn-down zero | P0 open count = 0 |
| CP-45 | P1 threshold | >=95% P1 resolved before RC |
| CP-46 | Rollback drill complete | rollback-to-stable performed successfully |
| CP-47 | Release candidate gate | all matrix blockers closed |
| CP-48 | Post-release canary | 48h canary without Sev1/Sev0 |

---

## 4) 200-case QA matrix

### Auth/Key (001-020)

001 valid login; 002 invalid key; 003 expired key; 004 zero credits key; 005 rotate same key rejected; 006 rotate valid key success; 007 rotate invalid rollback old key; 008 auth status unauthenticated path; 009 auth status stale local key; 010 logout clears streams; 011 credits endpoint unavailable; 012 credits endpoint malformed payload; 013 concurrent rotate requests; 014 rotate during active stream; 015 rotate during migration; 016 key recovery dialog forbidden reason; 017 key recovery dialog unauthorized reason; 018 low-credits confirm continue; 019 low-credits cancel reset; 020 auth file unreadable fallback.

### Projects/Workspace Open (021-040)

021 list projects empty; 022 list projects with mixed key hashes; 023 create project happy path; 024 create project parse failure; 025 delete project remote not found local cleanup; 026 open workspace valid; 027 open workspace invalid id; 028 open workspace missing local row; 029 open workspace credits exhausted 402; 030 open workspace forbidden differentKey; 031 open workspace forbidden true auth failure; 032 open workspace reuse existing connection; 033 open workspace with stale agent url; 034 close workspace cleanup watchers; 035 close workspace cleanup streams; 036 reopen after close; 037 parallel open requests same project; 038 open with alias old->new; 039 open during migration in progress; 040 open after migration completed.

### Continuation/Migration (041-070)

041 status endpoint needsContinuation false; 042 status endpoint needsContinuation true; 043 capture snapshot success; 044 capture snapshot ssh fail; 045 enact with missing source id; 046 enact with missing auth key; 047 enact create target fails; 048 enact verify target fails; 049 enact copy succeeds source preserved until validate; 050 enact copy fails source preserved true; 051 migration stage resumes after crash; 052 migration retry idempotent; 053 alias map written on success; 054 alias map rollback on failure; 055 source delete blocked pre-validation; 056 source delete allowed post-retention; 057 migrate with no snapshot warning; 058 migrate with large snapshot; 059 migrate with binary files skipped logged; 060 migrate duplicate project name collision; 061 migrate with watcher active remap; 062 migrate with active stream abort behavior; 063 migration audit log emitted; 064 migration cancellation mid-copy; 065 migration continuation after key rotate again; 066 legacy link resolves canonical id; 067 canonical link backward compatibility; 068 migration API schema fuzz invalid body; 069 migration DB lock contention; 070 migration rollback drill.

### Watcher/SSH/Forbidden Loops (071-100)

071 watcher start success; 072 watcher duplicate start ignored; 073 watcher detects file changes; 074 watcher false positive no changes; 075 watcher forbidden once; 076 watcher forbidden repeated enters quarantine; 077 watcher quarantine cooldown exit; 078 watcher stale remap to target; 079 watcher stop on workspace close; 080 watcher stop all on logout; 081 ssh acquire success; 082 ssh acquire parse malformed; 083 ssh auth fail retry once; 084 ssh repeated auth fail backoff; 085 ssh exec retry after disconnect; 086 ssh stale callback ignored; 087 ssh pending singleflight same project; 088 ssh pending multi-project isolation; 089 tunnel open success; 090 tunnel open conflict; 091 tunnel stop project only; 092 tunnel stop all; 093 terminal ws connect success; 094 terminal ws resize path; 095 terminal ws binary payload; 096 terminal ws disconnect cleanup; 097 forbidden storm 10x no loop; 098 migrate while watcher quarantined; 099 recover watcher after key rotation; 100 soak watcher 24h.

### Chat Stream Lifecycle (101-140)

101 stream start event emitted once; 102 stream delta append ordering; 103 tool_use before text; 104 tool_result without tool_use handled; 105 done terminal complete; 106 error terminal error; 107 aborted terminal aborted; 108 credits_exhausted terminal cut_off; 109 no-content terminal empty; 110 cut_off with content flagged; 111 duplicate end event ignored; 112 error then end deduped; 113 aborted then end deduped; 114 network drop mid-stream cut_off; 115 stream id mismatch ignored; 116 sequence out-of-order ignored; 117 sequence duplicate ignored; 118 stream registry replace existing session; 119 stop agent no agentUrl path; 120 abort endpoint missing params; 121 send message missing prompt; 122 send message missing project; 123 send message unknown session; 124 send message wrong session project; 125 retry from prior user message; 126 continue from cut_off tail; 127 continue when not cut_off blocked; 128 concurrent sends same session prevented; 129 concurrent sends different sessions allowed; 130 tool calls attached to final assistant msg; 131 orphan tool call count zero; 132 assistant message persisted once; 133 token counts persisted correctly; 134 stream low credits event updates UI; 135 credits exhausted opens recovery; 136 stream empty banner shown; 137 stream error banner shown; 138 stream aborted banner shown; 139 session export includes statuses; 140 stream soak 8h.

### Files/Editor/Autosave (141-165)

141 list root dir; 142 list nested dir; 143 read file text; 144 read missing file; 145 write file success; 146 write file permission denied; 147 delete file success; 148 delete directory recursive; 149 mkdir success; 150 rename success; 151 rename collision; 152 file tree refresh after ws file:changed; 153 file tree expanded nodes retained; 154 open file content cache; 155 close file removes dirty state; 156 ctrl+s save command; 157 autosave debounce single file; 158 autosave debounce multi-file; 159 autosave canceled on unmount; 160 autosave during project switch; 161 binary file read guard; 162 large file edit performance; 163 download file URL works; 164 context menu action cancel; 165 prompt/confirm replacement modal path.

### UX/Dialogs/Settings (166-185)

166 workspace connect loading state; 167 workspace connect error retry; 168 resume banner with existing session; 169 resume banner no sessions hidden; 170 continuation banner behavior; 171 continuation dialog success redirect; 172 continuation dialog failure retry; 173 key recovery success resume workspace; 174 key recovery failure messaging; 175 credits dialog rotate success; 176 credits dialog rotate failure; 177 backup dialog list/create/restore; 178 logs dialog live updates; 179 settings load success; 180 settings load failure fallback; 181 settings save success; 182 settings save malformed payload; 183 dashboard search filter; 184 dashboard diff-key badges; 185 accessibility keyboard focus traps dialogs.

### Security/Contracts/Resilience/Release (186-200)

186 malformed JSON body all routes; 187 oversized payload rejection; 188 invalid query params; 189 path traversal attempt blocked; 190 ws malformed message ignored safely; 191 config schema invalid fallback defaults; 192 db migration up from old schema; 193 db rollback to previous release; 194 feature flag fallback stream_fsm_v1; 195 feature flag fallback migration_v1; 196 chaos random ws disconnects; 197 fuzz random CLI payloads; 198 stress 1k sequential chat requests; 199 canary deploy with 5% users; 200 full rollback runbook timed drill.

---

## 5) Sign-off workflow

- **Daily:** subsystem owners update case pass/fail, blocker, next action
- **Per tranche end:** release manager runs formal gate checklist
- **Before RC:** CP-44, CP-45, CP-46 hard sign-off required
- **Before prod:** CP-47 pass + active canary monitor dashboard

---

## 6) Required dashboards

1. P0/P1 burn-down with aging and blocked reasons
2. Stream terminal duplication and orphan tool-call counters
3. Watcher forbidden-loop incidents and quarantine counts
4. Migration stage success/failure and alias resolution metrics
5. Dialog transition failure telemetry and WS reconnect duplication
