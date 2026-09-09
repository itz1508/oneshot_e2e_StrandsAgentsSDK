import test from "node:test";
import assert from "node:assert/strict";
import type {
  EdgeDefinition,
  MultiAgentNode,
  NodeDefinition,
} from "@strands-agents/sdk/multiagent";
import { createOneShotCanonicalWorkflow } from "../../workflow/strands/canonical-workflow.js";
import { harness } from "./harness.js";

function nodeIds(nodes: NodeDefinition[]): string[] {
  return nodes.map((node) => (node as { id: string }).id);
}

function edgePairs(edges: EdgeDefinition[]): [string, string][] {
  return edges.map((edge) =>
    Array.isArray(edge) ? [edge[0], edge[1]] : [edge.source, edge.target],
  );
}

test("canonical Strands graph keeps both human gates, the canonical chain, and bounded cycles", async () => {
  const h = await harness("strands-structure");
  try {
    const build = createOneShotCanonicalWorkflow(
      {
        researcher: h.researcher,
        planner: h.planner,
        refactor: h.refactor,
        gapper: h.gapper,
        evaluator: h.evaluator,
        triple: h.triple,
        confirmation: h.confirmation,
        hash: h.hash,
        builder: h.builder,
      },
      {
        event() {},
        async save() {
          return "test-artifact";
        },
        review: async (_runId, research) => research,
        buildReview: async () => {},
        finishPassed() {},
        finishRoot() {},
      },
    );

    assert.deepEqual(nodeIds(build.nodes), [
      "Researcher",
      "ResearchReviewGate",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "BuildReadyGate",
      "Builder",
      "Hash",
      "Done",
    ]);

    assert.deepEqual(edgePairs(build.edges), [
      ["Researcher", "ResearchReviewGate"],
      ["ResearchReviewGate", "Planner"],
      ["Planner", "Refactor"],
      ["Refactor", "GapAnalysis"],
      ["GapAnalysis", "Evaluation"],
      ["Evaluation", "TripleValidation"],
      ["TripleValidation", "Confirmed"],
      ["Confirmed", "CreateHash"],
      ["CreateHash", "BuildReadyGate"],
      ["BuildReadyGate", "Builder"],
      ["Builder", "Hash"],
      ["Hash", "Done"],
    ]);

    const gapNode = build.gap.node as MultiAgentNode;
    assert.equal(gapNode.id, "GapAnalysis");
    assert.equal(gapNode.orchestrator.id, "GapAnalysis");
    assert.deepEqual(nodeIds(build.gap.nodes as NodeDefinition[]), [
      "GapCheck",
      "GapFix",
      "GapRecheck",
      "GapComplete",
    ]);
    assert.ok(
      edgePairs(build.gap.edges as EdgeDefinition[]).some(
        ([source, target]) => source === "GapRecheck" && target === "GapCheck",
      ),
      "gap cycle must loop back to the check node",
    );

    const proofNode = build.proof.node as MultiAgentNode;
    assert.equal(proofNode.id, "TripleValidation");
    const proofIds = nodeIds(build.proof.nodes as NodeDefinition[]);
    for (const expected of [
      "TripleValidationAdmission",
      "SchemaValidationAgent",
      "FixtureValidationAgent",
      "GoalValidationAgent",
      "TripleValidationJoin",
      "TripleValidationRefineCheck",
      "GapAnalysisRefine",
      "ValidationRefineProgressCheck",
      "ValidationRefineEvaluation",
    ]) {
      assert.ok(proofIds.includes(expected), `missing proof node ${expected}`);
    }
    const proofPairs = edgePairs(build.proof.edges as EdgeDefinition[]);
    for (const validator of [
      "SchemaValidationAgent",
      "FixtureValidationAgent",
      "GoalValidationAgent",
    ]) {
      assert.ok(
        proofPairs.some(([source, target]) => source === "TripleValidationAdmission" && target === validator),
        `expected parallel fan-out edge to ${validator}`,
      );
      assert.ok(
        proofPairs.some(([source, target]) => source === validator && target === "TripleValidationJoin"),
        `expected parallel join edge from ${validator}`,
      );
    }
    assert.ok(
      proofPairs.some(
        ([source, target]) =>
          source === "ValidationRefineEvaluation" &&
          target === "TripleValidationAdmission",
      ),
      "validation refinement must cycle back to the proof admission",
    );
  } finally {
    h.close();
  }
});
