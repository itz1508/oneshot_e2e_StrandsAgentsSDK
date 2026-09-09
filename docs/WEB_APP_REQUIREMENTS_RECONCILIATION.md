# Web application requirements and implementation status

Imported on 2026-09-06 from the user-supplied Downloads files. Source inspection
uses checkout `9091060` plus the current documentation edits. This is a bounded
documentation reconciliation, not a full feature audit or live verification.

## Reading order and authority

1. [Web application source of truth v3](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md)
   defines required product behavior and preservation constraints.
2. [LLM workflow call diagram](LLM%20WorkFlow%20CALL.txt) gives the supplied
   six-phase target sequence and its two human gates.
3. [Canonical workflow](CANONICAL_WORKFLOW.md) records stage/artifact ownership
   and the required human control boundaries.
4. [Workflow tree](WORKFLOW_TREE) maps the implementation, including differences
   between the primary pipeline and fallback runtime.
5. This document records import context, verified differences, and unresolved
   acceptance evidence. Contracts remain in [backend/schema](../backend/schema/).

The source-of-truth import retains its wording and section numbers. Its one
relative `cloud/README.md` link was adjusted for the new location, and line
endings were normalized. The TXT import is byte-for-byte unchanged. Paths such
as `src/`, `cloud/`, and `dist/` in the imported web document are relative to
`app/web/`, not to this documentation directory.

`USER-ESTABLISHED` rules describe required behavior. Imported
`EVIDENCE-CONFIRMED` labels preserve the supplied assessment; they are not
blanket proof that every statement matches this checkout. Source differences
below must stay visible until implementation and verification close them.

## Required behavior versus current evidence

| Requirement / source sections | Current source evidence | Status and documentation interpretation |
| --- | --- | --- |
| Research Review before Planner (§16–18) | `backend/workflow/canonical-transition.ts` waits after Researcher; `backend/pipeline/confirm-plan.ts` queues Planner after confirmation | Primary continuation gate exists. Editable review and Research Again must not be assumed to have identical support across runtimes. |
| Existing review actions (§3.2, §23) | `backend/server/http-server.ts` implements `POST /api/runs/:id/confirm-plan` and `GET/POST /api/runs/:id/review`; `backend/runtime/plan-review.ts` checks review revision and status | The supplied route inventory is incomplete. These routes exist; they do not prove every requested edit scope or cross-worker concurrency case. |
| Build Ready before Builder (§25–26, §40–42) | `backend/workflow/canonical-transition.ts` now returns `wait-build` after `hash`; `backend/runtime/build-review.ts` implements a hash- and package-bound gate (`GET/POST /api/runs/:id/build-review`, `backend/schema/build-review-action.schema.json`); Builder (`backend/pipeline/processors.ts`) calls `requireApproved` before execution, and the Strands graph path waits via `workflow-runtime.ts`. Gate tests pass (`backend/tests/ts/build-review.test.ts`: no Builder before approval, return stays waiting, hash-bound approval, terminal rejection). | Gate #2 is implemented in both the BullMQ pipeline and the Strands canonical workflow runtime. Remaining acceptance work: cross-worker stale-action audit and UI end-to-end verification; Research Again binding and the three edit scopes are still open. |
| Six LLM phases (§9 and TXT) | Planner calls `plannerFindings`, Refactor calls `applyAudit`, Gap Analysis and Evaluation use deterministic tools; Builder calls `SandboxService` | Six named responsibilities are present, but six actual LLM calls are not established. The diagram is a product requirement, not a measured call trace or automatic authorization to replace implementations. |
| Planner ownership (§17–18) | `backend/agents/researcher/workflow.ts` returns a bundle containing `plan_id`; Planner produces `audit_id` | “Planner owns planning” is a product description. Preserve Researcher's existing artifact ownership and Planner's audit boundary; do not transfer `plan_id` ownership. |
| JobId alias (§8) | Browser contracts use `run_id`; primary jobs use `runId` | Display JobId from the existing run identity. Version-2 queue payloads also contain version, stage, and iteration, so “only the run identity” is not a literal complete payload description. |
| Explicit selected target (§11–15) | `backend/index.ts` resolves `ONESHOT_WORKSPACE_ROOT` or `projectRoot` | Self-target fallback exists. Explicit selection, upload materialization, and per-file mutation history need their own evidence; this import does not certify them. |
| Existing frontend root (§2) | `backend/index.ts` prefers `app/web/dist` and retains a fallback to `ui` | `app/web/` remains the maintained frontend. A retained bootstrap fallback does not make the retired `ui/` tree a new development target. |
| Commands (§54, §59) | Root and `app/web/package.json` have different scripts | Root does not define `typecheck` or `lint`; use the scoped commands below. Do not add placeholder scripts to make the imported list appear satisfied. |
| Plan/Phase/Task edits and rollback (§22–26, §48–51) | Current review service supports objective, existing requirement/step text, and notes | This is not proof of global rollback, phase resync, or running-state edit hooks. These remain acceptance work requiring runtime contract inspection. |
| History and deployment (§35–36, §53) | File-backed runtime stores and Redis history exist in source | Render remains the supplied target requirement. Cross-redeploy durability was not verified; store existence alone does not establish deployed persistence. |

## Product acceptance details to preserve

- Research acceptance and Build authorization are distinct decisions. Neither
  substitutes for deterministic validation or hash equality.
- Build Ready Cancel/return must leave Builder unstarted and preserve the
  confirmed package until an authorized change invalidates it.
- Normal execution is read-only. Plan Edit is global, Phase Edit is scoped to
  its phase, and Task/Step Edit is narrow. Runtime state must enforce authority.
- Explorer represents the real selected workspace. Created/modified markers
  decorate real files and require runtime evidence.
- Task Management displays Phase → Step → Task. Its 180-degree flip means
  Current Job ↔ Job History only; ordinary phase progression does not flip it.
- Conversation, current work, history, files, and final verification describe
  the same run. Superseded active work must remain inspectable in history.
- Sandbox presentation reflects actual execution. Its temporary panel can
  collapse after displaying verification while the final result remains visible.
- Provider credentials remain server-side. UI states, hashes, progress, and
  deliverables must come from actual backend results.

These are acceptance requirements, not claims that all listed UI behaviors
have been tested. Use the imported §58 blocking conditions when their absence
is established. Uninspected upload, rollback, mutation-ledger, and deployed
durability capabilities are unresolved here rather than declared missing.

## Commands in this checkout

Run from the repository root when implementing or validating related changes:

```text
npm --prefix app/web run typecheck
npm --prefix app/web run lint
npm --prefix app/web test
npm test
npm run build
npm start
```

`npm run verify` is the repository-wide verification entrypoint. `npm start`
launches a service and requires separate health/browser evidence; it is not a
finite test. Dependency installation belongs to setup, not to importing docs.
This documentation update only checks imported content, links, whitespace,
and the source manifest; it does not report those runtime commands as passed.

Before closing any gap, inspect the relevant server action, state transition,
schema, runtime path, and tests. Research official documentation for any actual
technical decision under the repository's reference-backed suggestion rule.
Importing these requirements does not itself change runtime, infrastructure,
schemas, providers, or dependencies.
