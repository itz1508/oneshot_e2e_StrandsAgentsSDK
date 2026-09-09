import type { ProcessingEvent } from "../contracts/schema/types.js";
import { BuilderAgent } from "../agents/builder/agent.js";
import { EvaluationAgent } from "../agents/evaluation/agent.js";
import { GapAnalysisAgent } from "../agents/gap-analysis/agent.js";
import { PlannerAgent } from "../agents/planner/agent.js";
import { RefactorAgent } from "../agents/refactor/agent.js";
import { ResearcherAgent } from "../agents/researcher/agent.js";

export interface AuthorityNode {
  id: string;
  label: string;
  authority: string;
  responsibility: string;
  skill?: string;
  tool?: string;
  capability?: string;
  input?: string;
  output?: string;
  owns?: readonly string[];
  state: "Pending" | "Running" | "Completed" | "Failed";
  artifact_id?: string;
}

const CATALOG: Record<
  string,
  Omit<AuthorityNode, "id" | "label" | "state" | "artifact_id">
> = {
  Researcher: {
    authority: ResearcherAgent.id,
    owns: ResearcherAgent.owns,
    responsibility: "research and evidence synthesis",
    skill: "researcher",
    tool: "evidence-collector",
    capability: "ResearchProvider",
    input: "Prompt(id)",
    output: "Researcher(id)",
  },
  Planner: {
    authority: PlannerAgent.id,
    owns: PlannerAgent.owns,
    responsibility: "read-only review and audit",
    skill: "planner",
    tool: "coverage",
    input: "plan_id",
    output: "audit_id",
  },
  Refactor: {
    authority: RefactorAgent.id,
    owns: RefactorAgent.owns,
    responsibility: "apply audit refinements",
    skill: "refactor",
    tool: "apply-audit",
    input: "plan_id + audit_id",
    output: "same plan_id",
  },
  GapAnalysis: {
    authority: GapAnalysisAgent.id,
    owns: GapAnalysisAgent.owns,
    responsibility:
      "identify/correct remaining plan gaps through the Strands conditional gap cycle",
    skill: "gap-analysis",
    tool: "coverage",
    capability: "Strands conditional cycle (deterministic)",
    input: "plan_id",
    output: "gap_0 + plan_id",
  },
  Evaluation: {
    authority: EvaluationAgent.id,
    owns: EvaluationAgent.owns,
    responsibility: "evaluate completed plan",
    skill: "evaluation",
    tool: "evaluate-plan",
    input: "gap_0 + plan_id",
    output: "plan_id + evaluation evidence",
  },
  SchemaValidation: {
    authority: "Validator",
    responsibility: "deterministic schema proof",
    skill: "canonical-contracts",
    tool: "validate_schema",
    capability: "ParallelAgent branch",
    input: "schema_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  FixtureValidation: {
    authority: "Validator",
    responsibility: "deterministic fixture proof",
    skill: "canonical-contracts",
    tool: "run_fixture",
    capability: "ParallelAgent branch",
    input: "fixture_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  GoalValidation: {
    authority: "Validator",
    responsibility: "deterministic goal proof",
    skill: "canonical-contracts",
    tool: "validate_references",
    capability: "ParallelAgent branch",
    input: "goal_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  TripleValidation: {
    authority: "Validator",
    responsibility: "join independent Schema, Fixture, and Goal proofs",
    skill: "canonical-contracts",
    capability: "Strands parallel fan-out + deterministic gate",
    input: "Schema + Fixture + Goal validation results",
    output: "VALID | NOT_VALID",
  },
  Confirmed: {
    authority: "CanonicalWorkflow",
    responsibility: "confirm only when all validators are VALID",
    skill: "canonical-contracts",
    input: "TripleValidation",
    output: "confirmed_package",
  },
  CreateHash: {
    authority: "CanonicalWorkflow",
    responsibility: "canonicalize confirmed core and create H1",
    skill: "canonical-contracts",
    tool: "create_hash",
    input: "confirmed_package.core",
    output: "HASH",
  },
  Builder: {
    authority: BuilderAgent.id,
    owns: BuilderAgent.owns,
    responsibility:
      "execute the exact confirmed package through the governed sandbox",
    skill: "sandbox-runtime",
    tool: "execute_sandbox",
    input: "confirmed_package + HASH + execution_authorization",
    output: "build_result + execution_evidence + hash_sandbox",
  },
  Hash: {
    authority: "CanonicalWorkflow",
    responsibility:
      "compare confirmation H1 with sandbox-side confirmed-core H2",
    skill: "canonical-contracts",
    tool: "verify_hash",
    input: "HASH + hash_sandbox",
    output: "verified HASH",
  },
  Done: {
    authority: "CanonicalWorkflow",
    responsibility: "terminal result projection",
    input: "build_result + verified HASH",
    output: "PASSED | ROOT_CAUSE",
  },

  // Researcher provider Strands subgraph. This remains distinct from the new
  // top-level canonical Strands workflow authority.
  "Strands:researcher-provider": {
    authority: "Researcher",
    responsibility: "provider invocation",
    skill: "researcher",
    capability: "Strands Agents provider binding",
    input: "Prompt(id) + evidence",
    output: "research draft",
  },
  "Strands:cache": {
    authority: "Researcher",
    responsibility: "non-canonical draft acceleration",
    capability: "Redis/in-memory cache",
    input: "semantic research request",
    output: "cached draft | miss",
  },
  "Strands:model-runner": {
    authority: "Researcher",
    responsibility: "model-agent execution",
    capability: "Strands model runner (deterministic)",
    input: "research request",
    output: "model request",
  },
  "Strands:litellm": {
    authority: "Researcher",
    responsibility: "model adapter",
    capability: "LiteLLM ollama_chat",
    input: "Strands model request",
    output: "Ollama request",
  },
  "Strands:ollama": {
    authority: "Researcher",
    responsibility: "local model serving",
    capability: "Ollama",
    input: "model request",
    output: "Gemma inference",
  },
  "Strands:gemma2": {
    authority: "Researcher",
    responsibility: "local inference",
    capability: "Gemma 2 9B",
    input: "structured research request",
    output: "structured response",
  },
  "Strands:research-draft": {
    authority: "Researcher",
    responsibility: "validated provider draft",
    capability: "Pydantic structured output",
    input: "model/cache result",
    output: "research draft",
  },

  // Sandbox execution is part of Builder's canonical execution responsibility.
  "ExternalSandbox:admission": {
    authority: "SandboxWorker",
    responsibility: "package structure and H1 admission proof",
    skill: "sandbox-runtime",
    tool: "verify_admission",
    input: "confirmed_package + HASH",
    output: "admission verified",
  },
  "ExternalSandbox:runner": {
    authority: "SandboxWorker",
    responsibility:
      "isolated execution within hardened container/process boundary",
    skill: "sandbox-runtime",
    tool: "execute_sandbox",
    input: "plan + execution_authorization",
    output: "execution result",
  },
  "ExternalSandbox:evidence": {
    authority: "SandboxWorker",
    responsibility: "execution evidence recording",
    skill: "sandbox-runtime",
    tool: "audit_sandbox",
    input: "execution output",
    output: "execution_evidence",
  },
  "ExternalSandbox:hash-verification": {
    authority: "SandboxWorker",
    responsibility: "recompute H2 from the same immutable confirmed core",
    skill: "sandbox-runtime",
    tool: "create_hash",
    input: "confirmed_package.core",
    output: "hash_sandbox",
  },
};

/** Projection-only authority/responsibility graph. */
export function projectAuthorityGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const event of events) latest.set(event.processor, event);

  const nodes = Object.entries(CATALOG).map(([id, catalog]) => {
    const event = latest.get(id);
    return {
      id,
      label: id
        .replace(/^Strands:/, "Strands / ")
        .replace(/^ExternalSandbox:/, "Sandbox / "),
      ...catalog,
      state: (event?.execution_status ?? "Pending") as AuthorityNode["state"],
      artifact_id: event?.artifact_id,
    };
  });

  const ids = new Set(nodes.map((node) => node.id));
  const edges: string[][] = [
    ["Researcher", "Planner"],
    ["Planner", "Refactor"],
    ["Refactor", "GapAnalysis"],
    ["GapAnalysis", "Evaluation"],
    ["Evaluation", "SchemaValidation"],
    ["Evaluation", "FixtureValidation"],
    ["Evaluation", "GoalValidation"],
    ["SchemaValidation", "TripleValidation"],
    ["FixtureValidation", "TripleValidation"],
    ["GoalValidation", "TripleValidation"],
    ["TripleValidation", "Confirmed"],
    ["Confirmed", "CreateHash"],
    ["CreateHash", "Builder"],
    ["Builder", "ExternalSandbox:admission"],
    ["ExternalSandbox:admission", "ExternalSandbox:runner"],
    ["ExternalSandbox:runner", "ExternalSandbox:evidence"],
    ["ExternalSandbox:evidence", "ExternalSandbox:hash-verification"],
    ["ExternalSandbox:hash-verification", "Hash"],
    ["Hash", "Done"],
  ];

  const researcherProvider = [
    "Strands:researcher-provider",
    "Strands:cache",
    "Strands:model-runner",
    "Strands:litellm",
    "Strands:ollama",
    "Strands:gemma2",
    "Strands:research-draft",
  ];
  for (let i = 0; i < researcherProvider.length - 1; i += 1) {
    edges.push([researcherProvider[i], researcherProvider[i + 1]]);
  }

  const unresolved = [...new Set(edges.flat().filter((id) => !ids.has(id)))];

  return {
    graph_id: "oneshot-authority-trace-v2",
    authority: "projection-only",
    traceability: { valid: unresolved.length === 0, unresolved },
    nodes,
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}
