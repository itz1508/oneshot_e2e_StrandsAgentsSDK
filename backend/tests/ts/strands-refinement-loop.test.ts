import test from "node:test";
import assert from "node:assert/strict";
import { Graph, type EdgeDefinition, type NodeDefinition } from "@strands-agents/sdk/multiagent";
import { createTripleValidationGraph } from "../../workflow/strands/proof-graph.js";
import { WORKFLOW_STATE, WorkflowRunState, type WorkflowEffects } from "../../workflow/strands/state.js";
import { harness, prompt } from "./harness.js";

test("NOT_VALID becomes Strands cycle feedback, improves the same plan, and all validators re-prove", async () => {
  const h = await harness("strands-refinement");
  const jobId = "job-strands-refinement-001";
  try {
    const research = await h.researcher.run(prompt(jobId), jobId);

    // Simulate a condition that escaped the preceding gap_0 proof. Triple
    // Validation must treat this as refinement feedback, not terminal failure.
    const missed = structuredClone(research.plan);
    missed.steps[0].goal_refs = [];

    const state = new WorkflowRunState();
    const events: Array<{
      processor: string;
      eventState: string;
      data: Record<string, unknown>;
    }> = [];
    const effects: WorkflowEffects = {
      event: (runId, processor, eventState, data = {}) => {
        events.push({ processor, eventState, data });
      },
      async save() {
        return "test-artifact";
      },
      review: async (_runId, bundle) => bundle,
      buildReview: async () => {},
      finishPassed() {},
      finishRoot() {},
    };
    state.set(WORKFLOW_STATE.runId, jobId);
    state.set(WORKFLOW_STATE.prompt, prompt(jobId));
    state.set(WORKFLOW_STATE.bundle, research);
    state.set(WORKFLOW_STATE.plan, missed);

    const build = createTripleValidationGraph(
      h.triple,
      h.gapper,
      h.evaluator,
      effects,
      state,
    );
    const graph = new Graph({
      id: "RefinementTest",
      nodes: build.nodes as NodeDefinition[],
      edges: build.edges as EdgeDefinition[],
      sources: ["TripleValidationAdmission"],
      maxSteps: 256,
    });
    const result = await graph.invoke(jobId);

    assert.equal(result.status, "COMPLETED");
    const triple = state.tripleValidation();
    assert.equal(triple.all_valid, true);
    assert.equal(triple.schema_validation.result, "Passed");
    assert.equal(triple.fixture_validation.result, "Passed");
    assert.equal(triple.goal_validation.result, "Passed");

    const plan = state.plan();
    assert.equal(plan.plan_id, missed.plan_id, "refinement preserves plan_id");
    assert.ok(plan.revision > missed.revision, "refinement increases revision");
    assert.ok(
      plan.steps[0].goal_refs.includes(
        research.goal.success_criteria[0].criterion_id,
      ),
      "refinement restores the missed goal traceability",
    );
    assert.equal(state.evaluation().result, "Passed");

    const goalCompletions = events.filter(
      (entry) =>
        entry.processor === "GoalValidation" && entry.eventState === "Completed",
    );
    assert.ok(
      goalCompletions.length >= 2,
      "expected the three validators to re-prove from scratch after refinement",
    );
    assert.equal(goalCompletions[0]?.data.test_result, "Failed");
    assert.equal(
      goalCompletions[goalCompletions.length - 1]?.data.test_result,
      "Passed",
    );
    console.log("STRANDS_REFINEMENT_JSON=" + JSON.stringify(triple));
  } finally {
    h.close();
  }
});
