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
| G1b | **Authority graph** shipped ADK capability strings ("Google ADK LoopAgent/ParallelAgent", node ids `ADK:*`, `execution_authority` references) | High (credibility) | ✅ FIXED — all capabilities/labels/ids rewritten to Strands equivalents (`Strands:*`, conditional gap cycle, parallel fan-out + deterministic gate) (TESTED) |
| G2 | `task-management.test` emitted legacy `ADK:cache` / scope `"ADK"` | Medium | ✅ FIXED — emits `Strands:cache` / scope `SUPPORT`; ordering guard satisfied (TESTED) |
| G3 | `ProcessingScope` union in `backend/contracts/schema/types.ts` still contained the literal `"ADK"` | Medium (contract) | ✅ FIXED — removed from the union AND from `backend/schema/processing-event.schema.json` (schema + types kept in sync); no emitters remain; schema Python validators pass |
| G4 | `backend/agents/gap-analysis/workflow.ts` comments said "ADK dynamic workflow" | Low | ✅ FIXED — wording updated to Strands canonical workflow |
| G5 | Old CDP browser scripts (`state-adaptive-e2e`, `verify-v3-visual`, `browser-e2e`, …) target the retired legacy console DOM | Medium (confusing automation) | ✅ SUPERSEDED — `strands-ui-walkthrough.mjs` is the current UI verification; legacy scripts retained only as reference |
| G6 | `INDEX.md` inventory predates the port (still listed `backend/workflow/adk/*`, deleted tests, ADK CI workflows) | Low (cosmetic) | ✅ FIXED — inventory refreshed: Strands workflow files, new strands tests, new docs (ARCHITECTURE/SUBMISSION/DEMO_VIDEO_SCRIPT/GAP_ANALYSIS), section counts corrected; ADK CI workflows removed |
| G7 | Web bundle not present in a fresh clone → `server.test` UI check 404s until `npm run build:ui` | Low (onboarding) | ✅ DOCUMENTED — README Verification section notes building the web UI before `npm test` in fresh clones |
| G8 | Demo video on YouTube predates the Strands port | Medium (submission) | ⬜ HUMAN ACTION — record with `docs/DEMO_VIDEO_SCRIPT.md`; walkthrough evidence supersedes the old tape |
| G9 | Live-provider run not demonstrated (sample-mode only) | Low (fair claims) | ⬜ HUMAN ACTION — optional; configure a provider and capture one live run for the submission video |
| G10 | Bedrock AgentCore deployment (judging "strengthens" criterion) | Low | ⬜ OPEN — docker/ + Cloud Run scripts exist; AgentCore-specific deploy not built |
| G11 | Devpost form entries (About description/topics, blog post, credits) | — | ◐ PARTIAL — GitHub About description, topics (`strands-agents`, `ai-agents`, `llm`, `human-in-the-loop`, `aws`, `nextjs`) and template flag set via `gh`; blog post + credits + form entries remain human actions |
| G12 | Stale ADK-era CI workflows (`.github/workflows/adk-v2-verify.yml`, `tmp-adk-researcher-node-test.yml`) | Low | ✅ FIXED — removed (triggered on nonexistent branches) |
| G13 | Orphaned fixture `app/fixtures/provider/adk-research-draft.json` (no production code references, but 5 test files referenced it by path) | Low | ✅ FIXED — renamed to `research-draft.json`; all test references updated (featherless-provider, provider-cloud-paths ×3, provider-infra, reconciled-deliverable) — 17/17 provider tests pass |

## 3. Repo-wide ADK reference sweep (final)

`ADK|@google|adk` across `backend/`, `app/`, `scripts/`, `docs/*.md`,
`README.md`: **0 matches** outside this document and `docs/SUBMISSION.md`
(which references the rename itself).

## 4. Baseline parity statement

Canonical semantics preserved by the port and re-verified: fixed stage
order, two mandatory human gates (hash- and package-bound), deterministic
Triple Validation with bounded refinement, `HASH == hash_sandbox` build
proof, `PASSED | ROOT_CAUSE` and `VALID | NOT_VALID` vocabularies,
append-only events with durable checkpoints, and UI projection of real
backend records only.
