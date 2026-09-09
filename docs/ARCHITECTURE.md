# OneShot Architecture

OneShot is a local-first, human-gated autonomous build pipeline orchestrated
by the [Strands Agents SDK](https://strandsagents.com/) for TypeScript. This
document maps the running system. For the authoritative product behavior,
read the [web app source of truth v3](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md);
for stage order and artifact ownership, read the
[canonical workflow](CANONICAL_WORKFLOW.md); the ASCII
[workflow tree](WORKFLOW_TREE) mirrors the same flow.

All diagrams are Mermaid and render directly on GitHub.

## 1. System view

```mermaid
flowchart LR
    subgraph Browser["Browser — app/web (Next.js App Router → static export in app/web/dist)"]
        UI["Workspace UI: Conversation · Research Review · Build Ready · Task Management · Job History · Explorer"]
        CLIENT["lib/api.ts — HTTP + SSE client"]
    end

    subgraph Node["Node backend (TypeScript, ESM)"]
        SRV["HTTP server, routing, security, path policy (backend/server)"]
        RT["Runtime state (backend/runtime): RunRepository · FileArtifactStore · BuildReviewService · PlanReviewService · WorkflowRuntime"]
        SG["Strands canonical workflow (backend/workflow/strands): Graph · deterministic nodes · cycles · shared run state"]
        AG["Agents (backend/agents): Researcher · Planner · Refactor · Gap Analysis · Evaluation · Builder"]
        PIP["Pipeline (backend/pipeline): BullMQ stage queues · checkpoints · recovery · review confirmation"]
        SBX["Sandbox (backend/sandbox): HardenedProcessRunner · ContainerSandboxRunner"]
        SCH["Contracts (backend/schema): JSON schemas + contract registry"]
    end

    subgraph Python["Python services"]
        VAL["Deterministic validators (backend/validation/python): schema · fixture · goal · canonicalization · hashing"]
        RSN["Python reasoner service (backend/python)"]
        WAPI["Workspace API (app/workspace_api — FastAPI)"]
    end

    subgraph External["External"]
        LLM["LLM providers: OpenAI · Anthropic · Gemini · Ollama/Featherless · custom"]
        STRANDS["@strands-agents/sdk — Graph · Node · multi-agent events"]
        REDIS["Redis — BullMQ run queue (optional; inline fallback)"]
        TGT["Target workspace (ONESHOT_WORKSPACE_ROOT)"]
FLX["Featherless (optional provider)"]
    end

    UI --> CLIENT --> SRV
    SRV --> RT
    RT --> SG
    SG -->|"schedules"| AG
    SG --- STRANDS
    SRV --> PIP
    AG -->|"validation RPC"| VAL
    AG -->|"provider adapters (app/web/cloud)"| LLM
    PIP --> REDIS
    AG --> SBX
    SBX -->|"writes only inside target"| TGT
    SRV --- WAPI
    SCH --- AG
    FLX -.-> LLM
```

Key boundaries:

- The browser consumes and projects real backend records, IDs, events, and
  results. It is never a second workflow store, and missing evidence renders
  as unavailable — never as success.
- Provider credentials stay server-side. The browser submits keys once
  (write-only); secrets are stored outside the repository and never returned
  to the client.
- Sandbox admission checks, workspace path policy, and authentication are
  enforced server-side before any target-workspace access.

## 2. Strands orchestration

The canonical workflow is a real Strands `Graph` from `@strands-agents/sdk`
(`backend/workflow/strands/`). Strands owns node scheduling, lifecycle,
streaming events, and graph traversal; every stage is a deterministic custom
node (`OneShotStageNode extends Node`), so no orchestration stage is an LLM
call by accident.

```mermaid
flowchart TD
    C["Chat / Intent collection"] --> Q{"Information ready?"}
    Q -- "No: ROOT_CAUSE + targeted help request" --> U["User answers"] --> C
    Q -- "Yes" --> P["Prompt_id"]
    P --> R["Researcher"]
    R --> G1["🛑 HUMAN GATE 1 — Research Review<br/>edit sections · request more research · ACCEPT"]
    G1 -- "Accept" --> PL["Planner → audit_id"]
    PL --> RF["Refactor → same logical plan_id"]
    RF --> GA["Gap Analysis — Strands conditional cycle<br/>GapCheck → GapFix → GapRecheck → GapCheck"]
    GA --> EV["Evaluation"]
    EV --> TV["Triple Validation — Strands subgraph<br/>Admission → Schema ∥ Fixture ∥ Goal (AND-join)<br/>→ Join → bounded refinement cycle (≤ 3)"]
    TV --> CONF["CONFIRMED immutable package"]
    CONF --> H["HASH over confirmed_package.core"]
    H --> G2["🛑 HUMAN GATE 2 — Build Ready<br/>Confirm Build · Cancel/return"]
    G2 -- "Return: run stays waiting, Builder never starts" --> G2
    G2 -- "Confirm Build (hash- and package-bound)" --> B["Builder executes the exact confirmed package in sandbox"]
    B --> HC{"Execution passed AND<br/>HASH == hash_sandbox?"}
    HC -- "Yes" --> D["✅ DONE"]
    HC -- "No" --> F["❌ FAILED"]
```

Strands mechanics used by the port:

- **Deterministic custom nodes** — `OneShotStageNode extends Node`
  (template-method `handle`), mirroring Strands' Agent/AgentNode contract
  without turning validation or planning stages into model calls.
- **Parallel fan-out with AND-join** — Schema, Fixture, and Goal validation
  run concurrently and join at `TripleValidationJoin`.
- **Conditional cycles** — the Gap Analysis ring
  (`GapCheck → GapFix → GapRecheck → GapCheck`) and the validation
  refinement ring use conditional `Edge` handlers and explicit `sources`;
  bounds are enforced in code (256 deterministic gap iterations, 3
  validation refinements, `maxSteps` safety nets).
- **Shared run state** — stage handlers return state deltas applied to a
  typed `WorkflowRunState`; the canonical `oneshot.*` keys are unchanged.

Deterministic guarantees, enforced in code (not by prompt):

- Planner cannot start before Research Review is explicitly accepted, and
  Builder cannot start before Build Ready is explicitly confirmed
  (`wait-build` + `BuildReviewService` rejects stale hash, changed package,
  duplicate approval, and approval after terminal state).
- The confirmation hash covers the canonical comparable representation of
  `confirmed_package.core`; Builder receives that exact package plus hash,
  and post-build verification is a direct equality check, `HASH ==
  hash_sandbox`, computed by the same canonicalization and hashing code.

## 3. Runtime ownership

The backend runtime is authoritative; the browser projects it
([source of truth §4](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md)).

```mermaid
flowchart LR
    CS["ConversationStore"] --> ICS["IntentCollectionService"]
    AES["AppendOnlyProcessingEventStore"] --> PEB["ProcessingEventBus"]
    PEB --> TM["TaskManagement"]
    PEB --> CKPT["CheckpointStore"]
    RR["RunRepository"]
    FAS["FileArtifactStore"]
    PH["PipelineHistory"]
    Q["BullMQ / Redis pipeline"] --- INLINE["inline fallback runtime (no Redis)"]
    SS["SandboxService"] --> HPR["HardenedProcessRunner"]
    SS --> CSR["ContainerSandboxRunner"]
    UI["Browser UI"] -.->|"projects, read-only"| RR
```

- `JobId` is a display alias for the existing `run_id`; exactly one run
  identity per run.
- Events are append-only; checkpoints and recovery test scripts cover
  restart and refinement recovery.

## 4. Contracts, validation, and hashing

```mermaid
flowchart LR
    SCHEMA["backend/schema — JSON Schemas + contract registry"] --> ART["Stage artifacts: plan · audit · gap · validation · confirmed package"]
    ART --> CANON["Canonicalization (backend/validation/python)"]
    CANON --> HASH["HASH over confirmed_package.core"]
    HASH --> HANDOFF["Build handoff: exact package + HASH"]
    HANDOFF --> SANDBOX["Sandbox execution"]
    SANDBOX --> H2["hash_sandbox recomputed from the built result"]
    H2 --> CMP{"HASH == hash_sandbox ?"}
    CMP -- "equal" --> DONE["DONE"]
    CMP -- "unequal or missing" --> FAIL["FAILED — rendered as unequal/unavailable, never fabricated"]
```

- Triple Validation is three independent proofs — Schema, Fixture, Goal —
  each returning `VALID | NOT_VALID`; `CONFIRMED` exists only when all
  three are `VALID`.
- Result vocabulary is fixed by contract: workflow operations return
  `PASSED | ROOT_CAUSE`; validation operations return `VALID | NOT_VALID`.

## 5. Deployment view

```mermaid
flowchart TB
    subgraph BuildTime["Build time"]
        NPM["npm run build"] --> TSC["tsc → dist/backend"]
        NPM --> WEB["Next.js build → static export → app/web/dist (bootstrap scripts externalized for CSP)"]
    end
    subgraph Runtime["Runtime — default port 8787"]
        NODE["node dist/backend/index.js — HTTP + SSE APIs and the static UI from app/web/dist"]
        OPT["Optional: Redis + pipeline worker · Python reasoner · container sandbox · FastAPI workspace API"]
    end
    subgraph Ship["Optional shipping"]
        DOCKER["docker/ images and compose files"]
        CLOUD["Cloud Run deploy + preflight/verify scripts"]
    end
    BuildTime --> Runtime
    Runtime -.-> Ship
```

## 6. Where to read next

| Topic | Document |
| --- | --- |
| Product behavior authority | [ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md](ONESHOT_WEB_APP_SOURCE_OF_TRUTH_v3.md) |
| Stage order, ownership, human gates | [CANONICAL_WORKFLOW.md](CANONICAL_WORKFLOW.md) |
| ASCII workflow tree | [WORKFLOW_TREE](WORKFLOW_TREE) |
| Requirement-to-implementation status | [WEB_APP_REQUIREMENTS_RECONCILIATION.md](WEB_APP_REQUIREMENTS_RECONCILIATION.md) |
| Submission package · demo video kit | [SUBMISSION.md](SUBMISSION.md) · [DEMO_VIDEO_SCRIPT.md](DEMO_VIDEO_SCRIPT.md) |
