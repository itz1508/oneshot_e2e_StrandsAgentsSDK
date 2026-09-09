# OneShot Canonical Workflow

Required product behavior includes the two human gates in the supplied
[web application requirements](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md) and
[LLM call diagram](LLM%20WorkFlow%20CALL.txt). The sequence below preserves
artifact ownership while showing those control boundaries. See the
[reconciliation](WEB_APP_REQUIREMENTS_RECONCILIATION.md) for implementation
status. The hash-to-Build transition now stops at Build Ready authorization:
`wait-build` after `hash`, with `BuildReviewService` enforcing a hash- and
package-bound Confirm Build before Builder (see the reconciliation table and
`backend/tests/ts/build-review.test.ts`). [WORKFLOW_TREE](WORKFLOW_TREE) maps
current code.

```text
Prompt_id
→ Researcher
→ Researcher(id)
   ├── plan_id
   ├── schema_id
   ├── fixture_id
   ├── goal_id
   └── validation_id
→ STOP: Research Review → explicit acceptance
→ Planner
→ audit_id
→ Refactor
→ same logical plan_id
→ Gap Analysis
→ gap_0 + plan_id
→ Evaluation
→ plan_id
→ Triple Validation
   ├── Schema Validation  → VALID | NOT_VALID
   ├── Fixture Validation → VALID | NOT_VALID
   └── Goal Validation    → VALID | NOT_VALID
→ all VALID
→ CONFIRMED
→ CREATE HASH
→ HASH
→ STOP: Build Ready → explicit Confirm Build
→ Builder / Sandbox (exact confirmed package + HASH)
→ successful execution + HASH == hash_sandbox
→ DONE
```

## Ownership

- Researcher owns `Researcher(id)`, `plan_id`, `schema_id`, `fixture_id`, `goal_id`, and `validation_id`.
- Planner consumes `plan_id` and produces `audit_id`.
- Refactor consumes `plan_id + audit_id` and returns the same logical `plan_id` with revision evidence.
- Gap Analysis closes identified gaps and returns `gap_0 + plan_id` after a fresh recheck.
- Evaluation evaluates the completed plan and returns the same `plan_id` with evaluation evidence.
- Schema, Fixture, and Goal validation are independent proofs. Each returns `VALID | NOT_VALID`.
- `CONFIRMED` exists when all three validators are `VALID`.
- Hash creation uses the canonical comparable representation `confirmed_package.core`.

## Result vocabulary

Workflow operations: `PASSED | ROOT_CAUSE`.
Validation operations: `VALID | NOT_VALID`.

## External execution verification boundary

The required product flow hands the confirmed immutable package and its created
hash to the external Builder/Sandbox boundary only after explicit Confirm Build.
Cancel/return keeps the run waiting without starting Builder or mutating the
target. This gate is implemented as `wait-build` after the hash stage, with
`BuildReviewService` (`backend/runtime/build-review.ts`) rejecting stale hash,
changed package, duplicate approval, and approval after terminal state; Builder
additionally calls `requireApproved` before execution. Remaining acceptance
evidence: cross-worker stale-action audit and UI end-to-end verification.
Verification uses the same canonical comparable representation
and direct equality:

```text
HASH == hash_sandbox
```

Execution/checkpoint metadata remains outside `confirmed_package.core`.

## Support layers before and around the canonical workflow

The canonical workflow still begins at `Prompt_id`. Chat/Intent support precedes it:

```text
Chat turns
→ Intent(id) revision
→ required information check
   ├─ missing → ROOT CAUSE + targeted help request → user answer → Intent revision
   └─ sufficient → Prompt(id)
→ canonical workflow above
```

Task Management, the Strands workflow projection, Intent graph, and Authority graph are projections/support metadata and are excluded from `confirmed_package.core`.
