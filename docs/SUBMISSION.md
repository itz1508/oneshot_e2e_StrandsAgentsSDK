# OneShot — Agents for Humans Submission Package

Hackathon: **Agents for Humans** (AWS × Devpost) — deadline
**Sep 14, 2026, 5:00pm PDT**. Required technology: **Strands Agents SDK**.
Repository: **https://github.com/itz1508/oneshot_e2e_StrandsAgentsSDK**
(public, branch `main`, Apache-2.0).

## 1. Requirement status

| # | Requirement | Status | Where it lives |
| --- | --- | --- | --- |
| 1 | Text description — what, who, how | ✅ Drafted | [§2](#2-text-description) and [README](../README.md) |
| 2 | Public URL to code repo | ✅ Live, public | https://github.com/itz1508/oneshot_e2e_StrandsAgentsSDK |
| 3 | Source code, assets, setup instructions | ✅ Complete | `app/`, `backend/`, `scripts/`, `docker/`; setup in [README §Quickstart](../README.md#quickstart); `MANIFEST.sha256` hashes every source file |
| 4 | MIT or Apache license visible in About | ✅ Apache-2.0 | [LICENSE](../LICENSE); confirm the GitHub About sidebar shows "Apache-2.0 license" |
| 5 | README | ✅ Updated | [README](../README.md) |
| 6 | Architecture diagram | ✅ Added | [ARCHITECTURE.md](ARCHITECTURE.md) — Strands orchestration, workflow, runtime, contracts, deployment |
| 7 | Demo video ≤ 5 min | 🟡 Kit ready, final recording pending | [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md); prior recording `docs/evidence/video/oneshot-live-processing-demo.mp4` |
| 8 | **Strands Agents SDK usage** | ✅ Deep integration | `backend/workflow/strands/` — Graph orchestration, deterministic nodes, parallel fan-out, conditional cycles |
| 9 | Blog post on builder.aws.com | ⬜ Human action | Title should include "Agents for Humans"; public before the deadline (bonus item) |

## 2. Text description

**What it does.** OneShot is a background build agent: you describe the work
in a chat, and a six-stage pipeline — Researcher, Planner, Refactor, Gap
Analysis, Evaluation, Builder — researches, plans, validates, and builds it
autonomously. It only surfaces twice, at mandatory human gates (Research
Review and Build Ready), and it only succeeds when the hash of what you
approved equals the hash of what was built (`HASH == hash_sandbox`). The
entire orchestration is a real Strands Agents `Graph`:
`@strands-agents/sdk` nodes schedule the canonical chain, run Schema,
Fixture, and Goal validation as parallel proof lanes with an AND-join, and
drive bounded conditional cycles for Gap Analysis and validation
refinement. It runs entirely on your machine — Next.js UI served by a Node
backend, BullMQ/Redis durable queues with an inline fallback, deterministic
Python validators, and hardened process/container sandboxes.

**Who it's for.** (a) Developers and teams who want autonomous code
generation they can audit and trust; (b) teams adopting AI agents under
review or compliance requirements, who must prove after the fact which
artifact was approved and that the built output matches it; (c) judges,
researchers, and practitioners studying human-in-the-loop agent pipelines.

**How it works.** Chat/Intent → Prompt → Researcher → 🛑 **Research Review**
→ Planner → Refactor → Gap Analysis (Strands conditional cycle, fix →
recheck until gap_0) → Evaluation → deterministic Triple Validation
(parallel Strands lanes; refinement converts NOT_VALID into Gap findings
and re-proves all three validators, bounded at 3) → **CONFIRMED** immutable
package → SHA-256 hash over `confirmed_package.core` → 🛑 **Build Ready** →
Builder executes that exact package in a sandbox → `HASH == hash_sandbox` →
DONE. Validators are deterministic code; the gates cannot be bypassed; the
browser only projects real backend records. Sample mode reproduces the full
demo with no API keys: `npm run demo`.

## 3. Why this fits the hackathon

- **Theme fit** — "runs autonomously and only surfaces when there's a real
  decision to make" is literally OneShot's two-gate design; the agent works
  in the background (queued, checkpointed, recoverable).
- **Strands usage** — genuine and visible: `Graph`, custom `Node`
  subclasses, conditional `Edge` cycles, parallel lanes, multi-agent events,
  structured state; not a wrapper.
- **Track** — Professional Agents (real professional workload: turning a
  request into a validated, hash-verified build).

## 4. Pre-submission checklist

1. ⬜ Record the ≤ 5-minute demo with [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md)
   (sample mode; no API keys needed).
2. ⬜ Upload to YouTube (unlisted); paste the URL into the Devpost form and
   the [README demo section](../README.md#demo-video).
3. ⬜ GitHub → repo **About ⚙**: description "Human-gated, hash-verified
   build agent on the Strands Agents SDK"; topics `strands-agents`,
   `ai-agents`, `llm`, `human-in-the-loop`, `aws`, `nextjs`. License chip
   should show Apache-2.0.
4. ⬜ Publish the builder.aws.com build-journey blog post (public before the
   deadline; include "Agents for Humans" in the title).
5. ⬜ Optional: request the $50 AWS credits from the hackathon Resources tab.
6. ⬜ Commit and push these changes (after manifest regeneration and
   verification pass):
   ```powershell
   git add -A
   git commit -m "feat: port canonical workflow to the Strands Agents SDK"
   git push origin main
   ```
7. ⬜ Submit on Devpost before **Sep 14, 2026 5:00pm PDT**; re-open the repo
   signed out and verify README renders, diagrams render, About shows
   Apache-2.0, and the demo video plays.

## 5. Evidence pointers for judges

- Strands integration: [ARCHITECTURE.md §2](ARCHITECTURE.md) and
  `backend/workflow/strands/` sources.
- Tests: `backend/tests/ts/strands-workflow-structure.test.ts`,
  `strands-gap-loop.test.ts`, `strands-refinement-loop.test.ts`,
  `strands-workflow-runtime.test.ts` (full chain to DONE with hash proof).
- Verification history: [APP_REVIEW.md](APP_REVIEW.md).
- One-command reproduction: `npm run demo` → http://localhost:8787.
