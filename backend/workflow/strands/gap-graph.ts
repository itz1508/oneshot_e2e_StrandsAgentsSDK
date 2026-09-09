import {
  Graph,
  MultiAgentNode,
  type EdgeDefinition,
  type NodeDefinition,
} from "@strands-agents/sdk/multiagent";
import type {
  GapAnalysisWorkflow,
  GapFixResult,
} from "../../agents/gap-analysis/workflow.js";
import type {
  Plan,
  ResolvedGap,
  ResearchBundle,
} from "../../contracts/schema/types.js";
import type { GapFinding } from "../../agents/gap-analysis/tool/coverage.js";
import { OneShotStageNode } from "./stage-node.js";
import {
  WORKFLOW_STATE,
  type WorkflowEffects,
  type WorkflowRunState,
  rootCauseDelta,
} from "./state.js";

const MAX_GAP_ITERATIONS = 256;

function refsFor(plan: Plan, finding: GapFinding): string[] | undefined {
  const step = finding.target_step_id
    ? plan.steps.find(
        (candidate) => candidate.step_id === finding.target_step_id,
      )
    : undefined;
  if (!step) return undefined;
  if (finding.affected_branch === "requirement") return step.requirement_refs;
  if (finding.affected_branch === "goal") return step.goal_refs;
  if (finding.affected_branch === "fixture") return step.fixture_refs;
  return step.schema_refs;
}

function alreadySatisfied(plan: Plan, finding: GapFinding): boolean {
  return refsFor(plan, finding)?.includes(finding.ref_id) ?? false;
}

function assertNoRegression(before: Plan, after: Plan): void {
  if (before.plan_id !== after.plan_id) {
    throw new Error("Gap Analysis changed logical plan_id");
  }
  if (after.revision < before.revision) {
    throw new Error("Gap improvement reduced plan revision");
  }
  const afterSteps = new Map(after.steps.map((step) => [step.step_id, step]));
  for (const previous of before.steps) {
    const current = afterSteps.get(previous.step_id);
    if (!current)
      throw new Error(`Gap improvement removed step ${previous.step_id}`);
    for (const field of [
      "requirement_refs",
      "goal_refs",
      "fixture_refs",
      "schema_refs",
    ] as const) {
      const currentRefs = new Set(current[field]);
      for (const ref of previous[field]) {
        if (!currentRefs.has(ref)) {
          throw new Error(`Gap improvement regressed ${field}: ${ref}`);
        }
      }
    }
  }
}

function mergeFindings(
  seed: GapFinding[],
  detected: GapFinding[],
): GapFinding[] {
  const merged = new Map<string, GapFinding>();
  for (const finding of [...seed, ...detected]) {
    if (!merged.has(finding.key)) merged.set(finding.key, finding);
  }
  return [...merged.values()];
}

export interface GapGraphBuild {
  node: MultiAgentNode;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

/**
 * Canonical Gap Analysis as a real Strands Graph cycle.
 *
 * Strands Graph joins use AND semantics on incoming edges, so the ring keeps
 * exactly one incoming edge per node: GapCheck (explicit source) -> GapFix
 * (when findings remain) -> GapRecheck -> back to GapCheck, with the exit
 * routed GapCheck -> GapComplete when no findings remain. Replaces the
 * previous ADK LoopAgent composition. The caller resets gap scratch state
 * (gap, findings, resolved gaps, iteration counter) before each fresh entry.
 */
export function createGapAnalysisGraph(
  gapper: GapAnalysisWorkflow,
  effects: WorkflowEffects,
  state: WorkflowRunState,
  graphId = "GapAnalysis",
): GapGraphBuild {
  const persist = async (run: WorkflowRunState): Promise<void> => {
    if (state.has("oneshot.gap_saved")) return;
    state.set("oneshot.gap_saved", true);
    const gap = run.gap();
    const plan = run.plan();
    const bundle: ResearchBundle = { ...run.bundle(), plan };
    await effects.save(run.runId(), "plan.gap", plan);
    await effects.save(run.runId(), "gap", gap);
    effects.event(run.runId(), "GapAnalysis", "Completed", {
      test_result: gap.result,
      artifact_id: gap.plan_id,
      message: `gap_0=${gap.gap_0}; resolved=${gap.resolved_gaps.length}`,
    });
    state.set(WORKFLOW_STATE.bundle, bundle);
    if (gap.root_cause) {
      state.set(WORKFLOW_STATE.rootCause, gap.root_cause);
    }
  };

  const check = new OneShotStageNode({
    id: "GapCheck",
    description: "Detects current deterministic plan gaps.",
    state,
    handler: async (run) => {
      if (!run.has("oneshot.gap_running_emitted")) {
        state.set("oneshot.gap_running_emitted", true);
        const message = state.get<string>("oneshot.gap_run_message");
        effects.event(run.runId(), "GapAnalysis", "Running", {
          ...(message ? { message } : {}),
        });
      }
      const plan = run.plan();
      const pending = (
        run.get<GapFinding[]>(WORKFLOW_STATE.gapSeedFindings) ?? []
      ).filter((finding) => !alreadySatisfied(plan, finding));
      state.set(WORKFLOW_STATE.gapSeedFindings, pending);
      const checked = gapper.inspect(run.bundle(), plan);
      return {
        stateDelta: {
          [WORKFLOW_STATE.gapFindings]: mergeFindings(pending, checked),
        },
      };
    },
  });

  const fix = new OneShotStageNode({
    id: "GapFix",
    description: "Fixes one deterministic gap per Strands cycle iteration.",
    state,
    handler: async (run) => {
      const findings = run.gapFindings();
      if (findings.length === 0) return;
      const finding = findings[0];
      const before = run.plan();
      const fixed: GapFixResult = gapper.resolveOne(
        run.bundle(),
        before,
        finding,
      );
      assertNoRegression(before, fixed.plan);
      state.set(WORKFLOW_STATE.plan, fixed.plan);

      if (fixed.rootCause) {
        const gap = await gapper.finalize(
          fixed.plan,
          run.resolvedGaps(),
          fixed.rootCause,
        );
        return {
          stateDelta: {
            [WORKFLOW_STATE.gap]: gap,
            ...rootCauseDelta(fixed.rootCause),
          },
        };
      }
      if (!fixed.resolved) {
        throw new Error(
          `Gap Analysis produced no improvement for ${finding.key}`,
        );
      }
      const iterations = (run.get<number>("oneshot.gap_iterations") ?? 0) + 1;
      state.set("oneshot.gap_iterations", iterations);
      if (iterations > MAX_GAP_ITERATIONS) {
        throw new Error("Gap Analysis exceeded deterministic refinement bound");
      }
      state.set(WORKFLOW_STATE.resolvedGaps, [
        ...run.resolvedGaps(),
        fixed.resolved,
      ]);
      state.set(
        WORKFLOW_STATE.gapSeedFindings,
        (run.get<GapFinding[]>(WORKFLOW_STATE.gapSeedFindings) ?? []).filter(
          (candidate) => candidate.key !== finding.key,
        ),
      );
    },
  });

  const recheck = new OneShotStageNode({
    id: "GapRecheck",
    description:
      "Rechecks the finite gap set and finalizes at gap_0 or ROOT_CAUSE.",
    runAfterRootCause: true,
    state,
    handler: async (run) => {
      if (run.has(WORKFLOW_STATE.gap)) {
        await persist(run);
        return;
      }
      const rootCause = run.rootCause();
      if (rootCause) {
        state.set(
          WORKFLOW_STATE.gap,
          await gapper.finalize(run.plan(), run.resolvedGaps(), rootCause),
        );
        await persist(run);
        return;
      }
      const remaining = gapper.inspect(run.bundle(), run.plan());
      if (remaining.length === 0) {
        state.set(
          WORKFLOW_STATE.gap,
          await gapper.finalize(run.plan(), run.resolvedGaps()),
        );
        await persist(run);
        return;
      }
      return { stateDelta: { [WORKFLOW_STATE.gapFindings]: remaining } };
    },
  });

  const complete = new OneShotStageNode({
    id: "GapComplete",
    description: "Finalizes and persists the terminal canonical gap result.",
    runAfterRootCause: true,
    state,
    handler: async (run) => {
      if (!run.has(WORKFLOW_STATE.gap)) {
        state.set(
          WORKFLOW_STATE.gap,
          await gapper.finalize(run.plan(), run.resolvedGaps()),
        );
      }
      await persist(run);
    },
  });

  const nodes: NodeDefinition[] = [check, fix, recheck, complete];
  const edges: EdgeDefinition[] = [
    {
      source: "GapCheck",
      target: "GapFix",
      handler: () => state.gapFindings().length > 0,
    },
    {
      source: "GapCheck",
      target: "GapComplete",
      handler: () => state.gapFindings().length === 0,
    },
    ["GapFix", "GapRecheck"],
    {
      source: "GapRecheck",
      target: "GapCheck",
      handler: () => !state.has(WORKFLOW_STATE.gap),
    },
  ];

  const graph = new Graph({
    id: graphId,
    nodes,
    edges,
    sources: ["GapCheck"],
    maxSteps: MAX_GAP_ITERATIONS * 3 + 16,
  });

  return { node: new MultiAgentNode({ orchestrator: graph }), nodes, edges };
}
