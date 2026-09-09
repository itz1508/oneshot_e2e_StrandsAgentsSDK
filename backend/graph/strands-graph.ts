import type { ProcessingEvent } from "../contracts/schema/types.js";

export type GraphNodeState = "Pending" | "Running" | "Completed" | "Failed";

export interface StrandsGraphNode {
  id: string;
  label: string;
  kind:
    | "workflow"
    | "stage"
    | "loop"
    | "parallel"
    | "gate"
    | "boundary"
    | "cache"
    | "agent"
    | "model-adapter"
    | "model-server"
    | "model"
    | "artifact";
  state: GraphNodeState;
  message?: string;
}

export interface StrandsGraphEdge {
  from: string;
  to: string;
  condition?: string;
}

interface NodeDefinition extends Omit<StrandsGraphNode, "state" | "message"> {
  processor?: string;
  inherit?: string;
}

const workflowDefs: NodeDefinition[] = [
  {
    id: "OneShotCanonicalWorkflow",
    label: "OneShot / Strands Workflow",
    kind: "workflow",
    processor: "Done",
  },
  {
    id: "Researcher",
    label: "Researcher",
    kind: "stage",
    processor: "Researcher",
  },
  { id: "Planner", label: "Planner", kind: "stage", processor: "Planner" },
  { id: "Refactor", label: "Refactor", kind: "stage", processor: "Refactor" },
  {
    id: "GapAnalysis",
    label: "Gap Analysis / Strands conditional cycle",
    kind: "workflow",
    processor: "GapAnalysis",
  },
  {
    id: "GapAnalysisCheck",
    label: "Gap Check",
    kind: "stage",
    inherit: "GapAnalysis",
  },
  {
    id: "GapAnalysisFix",
    label: "Gap Improve",
    kind: "stage",
    inherit: "GapAnalysis",
  },
  {
    id: "GapAnalysisFinalize",
    label: "Gap Finalize",
    kind: "gate",
    inherit: "GapAnalysis",
  },
  {
    id: "Evaluation",
    label: "Evaluation",
    kind: "stage",
    processor: "Evaluation",
  },
  {
    id: "TripleValidation",
    label: "Triple Validation / Strands parallel fan-out",
    kind: "parallel",
    processor: "TripleValidation",
  },
  {
    id: "SchemaValidation",
    label: "Schema Validation",
    kind: "stage",
    processor: "SchemaValidation",
  },
  {
    id: "FixtureValidation",
    label: "Fixture Validation",
    kind: "stage",
    processor: "FixtureValidation",
  },
  {
    id: "GoalValidation",
    label: "Goal Validation",
    kind: "stage",
    processor: "GoalValidation",
  },
  { id: "Confirmed", label: "Confirmed", kind: "gate", processor: "Confirmed" },
  {
    id: "CreateHash",
    label: "Create H1",
    kind: "stage",
    processor: "CreateHash",
  },
  {
    id: "Builder",
    label: "Builder / Sandbox Execution",
    kind: "stage",
    processor: "Builder",
  },
  { id: "Hash", label: "H1 = Sandbox H2", kind: "gate", processor: "Hash" },
  { id: "Done", label: "Done", kind: "gate", processor: "Done" },
];

const providerDefs: NodeDefinition[] = [
  {
    id: "Provider:researcher",
    label: "Researcher Provider Binding",
    kind: "boundary",
    processor: "ProviderBinding:Researcher",
  },
  {
    id: "Provider:cache",
    label: "Research Draft Cache",
    kind: "cache",
    processor: "Strands:cache",
  },
  {
    id: "Provider:runner",
    label: "OneShot Strands Researcher Pipeline",
    kind: "agent",
    processor: "Strands:researcher-pipeline",
  },
  {
    id: "Provider:distribution",
    label: "Distribution Model",
    kind: "model",
    processor: "Strands:distribution-model",
  },
  {
    id: "Provider:research",
    label: "Research Model",
    kind: "model",
    processor: "Strands:research-model",
  },
  {
    id: "Provider:synthesis",
    label: "Synthesis Model",
    kind: "model",
    processor: "Strands:synthesis-model",
  },
  {
    id: "Provider:research-draft",
    label: "Structured Research Draft",
    kind: "artifact",
    processor: "Strands:research-draft",
  },
];

export const STRANDS_GRAPH_EDGES: StrandsGraphEdge[] = [
  { from: "OneShotWorkflow", to: "OneShotPipeline", condition: "START" },
  { from: "OneShotPipeline", to: "Researcher", condition: "ctx.runNode" },
  { from: "Researcher", to: "Planner" },
  { from: "Planner", to: "Refactor" },
  { from: "Refactor", to: "GapAnalysis" },
  { from: "GapAnalysis", to: "GapAnalysisCheck", condition: "ctx.runNode" },
  { from: "GapAnalysisCheck", to: "GapAnalysisFix", condition: "gap found" },
  {
    from: "GapAnalysisFix",
    to: "GapAnalysisCheck",
    condition: "fresh recheck",
  },
  { from: "GapAnalysisCheck", to: "GapAnalysisFinalize", condition: "gap_0" },
  { from: "GapAnalysisFinalize", to: "Evaluation" },
  { from: "Evaluation", to: "TripleValidation", condition: "Passed" },
  {
    from: "TripleValidation",
    to: "SchemaValidation",
    condition: "parallel ctx.runNode",
  },
  {
    from: "TripleValidation",
    to: "FixtureValidation",
    condition: "parallel ctx.runNode",
  },
  {
    from: "TripleValidation",
    to: "GoalValidation",
    condition: "parallel ctx.runNode",
  },
  {
    from: "SchemaValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "FixtureValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "GoalValidation",
    to: "Confirmed",
    condition: "VALID with all lanes",
  },
  {
    from: "TripleValidation",
    to: "GapAnalysis",
    condition: "NOT_VALID feedback",
  },
  { from: "Confirmed", to: "CreateHash" },
  { from: "CreateHash", to: "Builder" },
  { from: "Builder", to: "Hash" },
  { from: "Hash", to: "Done", condition: "MATCH" },

  // Researcher provider/model subgraph attached beneath the real Researcher node.
  {
    from: "Researcher",
    to: "Provider:researcher",
    condition: "provider binding",
  },
  { from: "Provider:researcher", to: "Provider:cache" },
  {
    from: "Provider:cache",
    to: "Provider:research-draft",
    condition: "cache hit",
  },
  { from: "Provider:cache", to: "Provider:runner", condition: "cache miss" },
  { from: "Provider:runner", to: "Provider:distribution" },
  { from: "Provider:distribution", to: "Provider:research" },
  { from: "Provider:research", to: "Provider:synthesis" },
  { from: "Provider:synthesis", to: "Provider:research-draft" },
];

function rootState(latest: Map<string, ProcessingEvent>): GraphNodeState {
  if (latest.get("Done")?.execution_status === "Completed") return "Completed";
  if ([...latest.values()].some((event) => event.execution_status === "Failed"))
    return "Failed";
  if (
    [...latest.values()].some((event) => event.execution_status === "Running")
  )
    return "Running";
  if (
    [...latest.values()].some((event) => event.execution_status === "Completed")
  )
    return "Running";
  return "Pending";
}

/**
 * Project the real Strands Agents workflow plus the Researcher provider
 * subgraph. This API is projection-only; execution authority remains the
 * actual Strands Graph nodes executed by WorkflowRuntime.
 */
export function projectStrandsGraph(events: ProcessingEvent[] = []) {
  const latest = new Map<string, ProcessingEvent>();
  for (const event of events) latest.set(event.processor, event);

  const defs = [...workflowDefs, ...providerDefs];
  const nodes = defs.map((definition) => {
    if (definition.id === "OneShotCanonicalWorkflow") {
      return {
        id: definition.id,
        label: definition.label,
        kind: definition.kind,
        state: rootState(latest),
      };
    }

    const processor = definition.processor ?? definition.inherit;
    const event = processor ? latest.get(processor) : undefined;
    return {
      id: definition.id,
      label: definition.label,
      kind: definition.kind,
      state: (event?.execution_status ?? "Pending") as GraphNodeState,
      message: event?.message,
    };
  });

  return {
    graph_id: "oneshot-strands-workflow-v3",
    authority: "projection-only",
    execution_authority: "@strands-agents/sdk",
    root_agent: {
      id: "OneShotCanonicalWorkflow",
      type: "Graph",
    },
    workflow_agents: {
      pipeline: "Strands Graph + deterministic OneShotStageNode nodes",
      gap_analysis: "conditional cycle (GapCheck → GapFix → GapRecheck)",
      triple_validation: "parallel fan-out with AND-join + bounded refinement cycle",
    },
    provider_subgraph: {
      attached_to: "Researcher",
      root: "Provider:researcher",
    },
    nodes,
    edges: STRANDS_GRAPH_EDGES,
  };
}
