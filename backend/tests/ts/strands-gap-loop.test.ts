import test from "node:test";
import assert from "node:assert/strict";
import { Graph, type EdgeDefinition, type NodeDefinition } from "@strands-agents/sdk/multiagent";
import { OneShotStageNode } from "../../workflow/strands/stage-node.js";
import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
} from "../../contracts/schema/types.js";
import type { GapFinding } from "../../agents/gap-analysis/tool/coverage.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import { createGapAnalysisGraph } from "../../workflow/strands/gap-graph.js";
import { WORKFLOW_STATE, WorkflowRunState, type WorkflowEffects } from "../../workflow/strands/state.js";
import { harness, prompt } from "./harness.js";

class OneIterationGapWorkflow extends GapAnalysisWorkflow {
  checks = 0;
  fixes = 0;
  private fixed = false;

  override inspect(_bundle: ResearchBundle, plan: Plan): GapFinding[] {
    this.checks += 1;
    if (this.fixed) return [];
    return [
      {
        key: "synthetic:one-iteration",
        affected_branch: "schema",
        ref_id: "schema:synthetic",
        target_step_id: plan.steps[0].step_id,
      },
    ];
  }

  override resolveOne(bundle: ResearchBundle, plan: Plan, gap: GapFinding) {
    this.fixes += 1;
    this.fixed = true;
    const next = structuredClone(plan);
    next.revision += 1;
    next.steps[0].schema_refs.push(gap.ref_id);
    next.revision_evidence.push({
      revision: next.revision,
      affected_area: "schema",
      reason: "Resolve synthetic Strands gap cycle proof",
      audit_finding_id: `gap:${gap.key}`,
    });
    const resolved: ResolvedGap = {
      gap_id: `gap:${gap.key}`,
      affected_branch: gap.affected_branch,
      issue: "Synthetic missing traceability for Strands gap cycle proof",
      evidence_ids: bundle.researcher.evidence.map((e) => e.evidence_id),
      required_correction: "Apply one deterministic additive correction",
      expected_resolved_state: "Synthetic gap removed",
      resolution_evidence: "Synthetic deterministic correction applied",
    };
    return { plan: next, resolved };
  }
}

test("Strands gap cycle fixes, rechecks, and exits at gap_0", async () => {
  const h = await harness("strands-gap-loop");
  try {
    const jobId = "strands-gap-loop-run";
    const bundle = await h.researcher.run(prompt(jobId), jobId);
    const gapper = new OneIterationGapWorkflow(h.contracts);
    const state = new WorkflowRunState();
    const events: string[] = [];
    const effects: WorkflowEffects = {
      event: (runId, processor, eventState) => {
        events.push(`${processor}:${eventState}`);
      },
      async save() {
        return "test-artifact";
      },
      review: async (_runId, research) => research,
      buildReview: async () => {},
      finishPassed() {},
      finishRoot() {},
    };
    state.set(WORKFLOW_STATE.runId, jobId);
    state.set(WORKFLOW_STATE.prompt, prompt(jobId));
    state.set(WORKFLOW_STATE.bundle, bundle);
    state.set(WORKFLOW_STATE.plan, bundle.plan);

    const build = createGapAnalysisGraph(gapper, effects, state);
    const graph = new Graph({
      id: "GapLoopTest",
      nodes: build.nodes as NodeDefinition[],
      edges: build.edges as EdgeDefinition[],
      sources: ["GapCheck"],
      maxSteps: 4096,
    });
    const result = await graph.invoke(jobId);

    assert.equal(result.status, "COMPLETED");
    assert.equal(gapper.fixes, 1);
    assert.ok(gapper.checks >= 2, `expected fresh recheck, got ${gapper.checks}`);
    const gap = state.gap() as GapAnalysis;
    assert.equal(gap.result, "Passed");
    assert.equal(gap.gap_0, true);
    const plan = state.plan();
    assert.equal(plan.plan_id, bundle.plan.plan_id);
    assert.ok(plan.revision > bundle.plan.revision);
    assert.ok(events.some((entry) => entry === "GapAnalysis:Running"));
    assert.ok(events.some((entry) => entry === "GapAnalysis:Completed"));
    console.log("STRANDS_GAP_LOOP_JSON=" + JSON.stringify({ gap, plan }));
  } finally {
    h.close();
  }
});
