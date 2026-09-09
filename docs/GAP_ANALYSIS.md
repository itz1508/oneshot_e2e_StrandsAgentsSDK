# OneShot Strands Port — Final Gap Analysis

Date: 2026-09-09 · Scope: `oneshot_e2e_StrandsAgentsSDK` @ main (Strands
Agents SDK port of the canonical OneShot workflow). Evidence classes follow
the repository review SOP: EXECUTED / TESTED / IMPLEMENTED / DOCUMENTED /
UNVERIFIED.

## 1. Verification state (EXECUTED / TESTED)

| Gate | Result |
| --- | --- |
| Backend build (`tsc -p tsconfig.json`) | ✅ clean |
| Full backend suite (`npm test`) | ✅ **142 tests — 141 pass, 0 fail, 1 skipped** (server/UI chain green with the built web bundle) |
| Strands-specific tests (`strands-*.test.ts`) | ✅ structure, gap cycle, refinement cycle, runtime-to-DONE |
| Web UI build (`npm run build:ui`) | ✅ static export published to `app/web/dist` |
| Web typecheck (`tsc --noEmit`) | ✅ clean |
| Web tests (`npm --prefix app/web test`) | ✅ **46/46 pass** |
| Browser walkthrough (`test:ui:walkthrough`) | ✅ 10/10 assertions, 9 screenshots, evidence JSON |
| Source manifest | ✅ generated + `MANIFEST_VERIFIED` |
| HTTP/UI product chain (`server.test`) | ✅ conversation → run → DONE → hash proof → durable reload |

## 2. Gaps found in the final sweep — and resolution

| # | Gap | Severity | Resolution |
| --- | --- | --- | --- |
| G1 | Graph projection shipped judge-visible ADK metadata: `execution_authority: "@google/adk"`, `graph_id: "oneshot-adk-dynamic-workflow-v3"`, labels "Google ADK …", processors `ADK:*` | High (credibility) | ✅ FIXED — renamed to `backend/graph/strands-graph.ts` (`projectStrandsGraph`, `oneshot-strands-workflow-v3`, `execution_authority: "@strands-agents/sdk"`, `Strands:*`), routes `/api/graphs/strands` + `/api/runs/:id/strands-graph` (`/adk-graph` kept as compat alias), skill renamed `project_strands_graph`, tests updated (TESTED) |
| G2 | `task-management.test` emitted legacy `ADK:cache` / scope `"ADK"` | Medium | ✅ FIXED — emits `Strands:cache` / scope `SUPPORT`; ordering guard satisfied (TESTED) |
| G3 | `ProcessingScope` union in `backend/contracts/schema/types.ts` still contains the literal `"ADK"` | Low (contract) | ⏳ INTENTIONAL KEEP — append-only event stores may hold historical `"ADK"`-scoped events; removing the union member would break replay of persisted runs. Revisit only with a store migration |
| G4 | `backend/agents/gap-analysis/workflow.ts` comments said "ADK dynamic workflow" | Low | ✅ FIXED — wording updated to Strands canonical workflow |
| G5 | Old CDP browser scripts (`state-adaptive-e2e`, `verify-v3-visual`, `browser-e2e`, …) target the retired legacy console DOM | Medium (confusing automation) | ✅ SUPERSEDED — `strands-ui-walkthrough.mjs` is the current UI verification; legacy scripts retained only as reference |
| G6 | `INDEX.md` inventory predates the port (still lists `backend/workflow/adk/*`) | Low (cosmetic) | ⏳ OPEN — no generator script in-repo; refresh manually or restore the generating tool |
| G7 | Web bundle not present in a fresh clone → `server.test` UI check 404s until `npm run build:ui` | Low (onboarding) | ⏳ OPEN — document `npm run build` before `npm test` in fresh clones (README Quickstart already builds) |
| G8 | Demo video on YouTube predates the Strands port | Medium (submission) | ⬜ HUMAN ACTION — record with `docs/DEMO_VIDEO_SCRIPT.md`; walkthrough evidence supersedes the old tape |
| G9 | Live-provider run not demonstrated (sample-mode only) | Low (fair claims) | ⬜ HUMAN ACTION — optional; configure a provider and capture one live run for the submission video |
| G10 | Bedrock AgentCore deployment (judging "strengthens" criterion) | Low | ⬜ OPEN — docker/ + Cloud Run scripts exist; AgentCore-specific deploy not built |
| G11 | Devpost form entries (About description/topics, blog post, credits) | — | ⬜ HUMAN ACTION — see docs/SUBMISSION.md §4 |

## 3. Final check runs (this sweep)

- `npm test` (full backend suite) — see `final-test.log`.
- `npm --prefix app/web run typecheck` + `npm --prefix app/web test` — see
  `web-typecheck.log` / `web-test.log`.
- Browser walkthrough — `walkthrough.log` +
  `dist/e2e-evidence/strands-walkthrough.json`.
- Manifest — `MANIFEST_VERIFIED` after the sweep.

## 4. Baseline parity statement

Canonical semantics preserved by the port and re-verified: fixed stage
order, two mandatory human gates (hash- and package-bound), deterministic
Triple Validation with bounded refinement, `HASH == hash_sandbox` build
proof, `PASSED | ROOT_CAUSE` and `VALID | NOT_VALID` vocabularies,
append-only events with durable checkpoints, and UI projection of real
backend records only.
