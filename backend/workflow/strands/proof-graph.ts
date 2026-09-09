import {
  Graph,
  MultiAgentNode,
  type EdgeDefinition,
  type NodeDefinition,
} from "@strands-agents/sdk/multiagent";
import type { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import type { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import { validationFeedback } from "../../agents/gap-analysis/tool/validation-feedback.js";
import { OneShotStageNode } from "./stage-node.js";
import { createGapAnalysisGraph } from "./gap-graph.js";
import {
  WORKFLOW_STATE,
  type WorkflowEffects,
  type WorkflowRunState,
  rootCauseDelta,
  validationSignature,
} from "./state.js";

const MAX_VALIDATION_REFINEMENTS = 3;

export interface ProofGraphBuild {
  node: MultiAgentNode;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

/**
 * Canonical Triple Validation plus bounded deterministic refinement as a real
 * Strands Graph.
 *
 * Schema, Fixture, and Goal run as parallel Strands nodes joined by AND
 * semantics. A NOT_VALID result is refinement feedback: it becomes Gap
 * findings, the same logical Plan improves, Evaluation reruns, and all three
 * validators are proved again from scratch — bounded at three refinements
 * with signature-stall and revision-progress root causes. Replaces the
 * previous ADK ParallelAgent composition and imperative refinement loop.
 */
export function createTripleValidationGraph(
  triple: TripleValidationWorkflow,
  gapper: GapAnalysisWorkflow,
  evaluator: EvaluationWorkflow,
  effects: WorkflowEffects,
  state: WorkflowRunState,
): ProofGraphBuild {
  const admission = new OneShotStageNode({
    id: "TripleValidationAdmission",
    description:
      "Checks Researcher-owned validator routing before parallel proof fan-out.",
    state,
    handler: async (run) => {
      try {
        await triple.assertRouting(run.bundle(), run.plan());
        return;
      } catch (error) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Triple Validation routing mismatch",
            expected:
              "Schema, Fixture, and Goal validation definitions route to the final plan and Researcher-owned IDs",
            actual: error instanceof Error ? error.message : String(error),
            evidence_ids: [],
            required_correction:
              "Correct the Researcher-owned validation routing inputs",
            recheck_target: run.plan().plan_id,
          }),
        };
      }
    },
  });

  const schema = new OneShotStageNode({
    id: "SchemaValidationAgent",
    description: "Runs deterministic Schema Validation on its Python lane.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "SchemaValidation", "Running");
      const result = await triple.schema(run.bundle(), run.plan());
      effects.event(runId, "SchemaValidation", "Completed", {
        test_result: result.result,
        artifact_id: result.schema_id,
      });
      return {
        stateDelta: { [WORKFLOW_STATE.schemaValidation]: result },
      };
    },
  });

  const fixture = new OneShotStageNode({
    id: "FixtureValidationAgent",
    description: "Runs deterministic Fixture Validation on its Python lane.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "FixtureValidation", "Running");
      const result = await triple.fixture(run.bundle(), run.plan());
      effects.event(runId, "FixtureValidation", "Completed", {
        test_result: result.result,
        artifact_id: result.fixture_id,
      });
      return {
        stateDelta: { [WORKFLOW_STATE.fixtureValidation]: result },
      };
    },
  });

  const goal = new OneShotStageNode({
    id: "GoalValidationAgent",
    description: "Runs deterministic Goal Validation on its Python lane.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "GoalValidation", "Running");
      const result = await triple.goal(run.bundle(), run.plan());
      effects.event(runId, "GoalValidation", "Completed", {
        test_result: result.result,
        artifact_id: result.goal_id,
      });
      return {
        stateDelta: { [WORKFLOW_STATE.goalValidation]: result },
      };
    },
  });

  const join = new OneShotStageNode({
    id: "TripleValidationJoin",
    description:
      "Joins the three proof results and applies the all_valid admission rule.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "TripleValidation", "Running");

      const result = await triple.join(
        run.bundle(),
        run.plan(),
        run.schemaValidation(),
        run.fixtureValidation(),
        run.goalValidation(),
      );

      await effects.save(runId, "triple-validation", result);
      effects.event(runId, "TripleValidation", "Completed", {
        test_result: result.all_valid ? "Passed" : "Failed",
        ...(result.all_valid ? {} : { issue_type: "Missing" }),
        artifact_id: result.validation_id,
        message: `all_valid=${result.all_valid}`,
      });

      return {
        stateDelta: {
          [WORKFLOW_STATE.tripleValidation]: result,
          ["oneshot.triple_valid"]: result.all_valid,
        },
      };
    },
  });

  const refineCheck = new OneShotStageNode({
    id: "TripleValidationRefineCheck",
    description:
      "Decides refinement after NOT_VALID: feedback seeding, signature stall, and deterministic bound.",
    state,
    handler: async (run) => {
      const triple = run.tripleValidation();
      if (triple.all_valid) return;
      const rootCause = run.rootCause();
      if (rootCause) return;

      const refinements = run.get<number>("oneshot.refinement_count") ?? 0;
      if (refinements >= MAX_VALIDATION_REFINEMENTS) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Validation refinement exceeded deterministic bound",
            expected: "The same logical Plan converges to all VALID proofs",
            actual: validationSignature(triple),
            evidence_ids: [],
            required_correction:
              "Provide additional information required to resolve the remaining validation findings",
            recheck_target: run.plan().plan_id,
          }),
        };
      }

      const signature = validationSignature(triple);
      const feedback = validationFeedback(run.bundle(), run.plan(), triple);
      if (feedback.findings.length === 0) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Triple Validation requires additional information",
            expected:
              "Every NOT_VALID proof maps to a deterministic evidence-backed Plan improvement",
            actual: feedback.unresolved.join("; ") || signature,
            evidence_ids: [
              ...triple.schema_validation.evidence,
              ...triple.fixture_validation.evidence,
              ...triple.goal_validation.evidence,
            ].map((evidence) => evidence.evidence_id),
            required_correction:
              "Provide the missing information required to improve the same logical Plan without guessing",
            recheck_target: run.plan().plan_id,
          }),
        };
      }

      const seen = run.get<string[]>("oneshot.validation_signatures") ?? [];
      if (seen.includes(signature)) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Validation refinement made no new progress",
            expected:
              "Each refinement removes at least one previously observed validation miss without reducing prior Plan value",
            actual: signature,
            evidence_ids: feedback.findings.flatMap(
              (finding) => finding.evidence_ids ?? [],
            ),
            required_correction:
              "Provide additional evidence for a new deterministic Plan improvement",
            recheck_target: run.plan().plan_id,
          }),
        };
      }

      const next = refinements + 1;
      state.set("oneshot.refinement_count", next);
      state.set("oneshot.validation_signatures", [...seen, signature]);
      state.set(WORKFLOW_STATE.gapSeedFindings, feedback.findings);
      state.set("oneshot.gap_run_message", `validation refinement=${next}`);
      state.set(
        "oneshot.evaluation_run_message",
        `validation refinement=${next}`,
      );
      state.set("oneshot.before_revision", run.plan().revision);
      // Reset gap scratch state for the fresh Strands gap-cycle entry.
      state.delete(WORKFLOW_STATE.gap);
      state.delete(WORKFLOW_STATE.gapFindings);
      state.delete("oneshot.gap_saved");
      state.delete("oneshot.gap_running_emitted");
      state.set(WORKFLOW_STATE.resolvedGaps, []);
      state.set("oneshot.gap_iterations", 0);
      return;
    },
  });

  const refineGap = createGapAnalysisGraph(gapper, effects, state, "GapAnalysisRefine");

  const progressCheck = new OneShotStageNode({
    id: "ValidationRefineProgressCheck",
    description:
      "Requires validation feedback to increase the same logical plan revision.",
    state,
    handler: async (run) => {
      if (run.rootCause()) return;
      const before = run.get<number>("oneshot.before_revision") ?? 0;
      if (run.plan().revision <= before) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Gap refinement did not improve the Plan",
            expected:
              "Validation feedback increases the same plan_id revision and preserves all prior value",
            actual: `revision remained ${run.plan().revision}`,
            evidence_ids: [],
            required_correction:
              "Provide a deterministic additive Plan improvement",
            recheck_target: run.plan().plan_id,
          }),
        };
      }
      return;
    },
  });

  const refineEval = new OneShotStageNode({
    id: "ValidationRefineEvaluation",
    description: "Reruns Evaluation on the refined plan.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      const message = run.get<string>("oneshot.evaluation_run_message");
      effects.event(runId, "Evaluation", "Running", {
        ...(message ? { message } : {}),
      });
      const result = await evaluator.run(run.bundle(), run.plan());
      await effects.save(runId, "evaluation", result);
      effects.event(runId, "Evaluation", "Completed", {
        result: result.result,
        artifact_id: result.plan_id,
      });
      if (result.result === "Failed" && result.root_cause) {
        return { stateDelta: rootCauseDelta(result.root_cause) };
      }
      return { stateDelta: { [WORKFLOW_STATE.evaluation]: result } };
    },
  });

  const nodes: NodeDefinition[] = [
    admission,
    schema,
    fixture,
    goal,
    join,
    refineCheck,
    refineGap.node,
    progressCheck,
    refineEval,
  ];
  const edges: EdgeDefinition[] = [
    ["TripleValidationAdmission", "SchemaValidationAgent"],
    ["TripleValidationAdmission", "FixtureValidationAgent"],
    ["TripleValidationAdmission", "GoalValidationAgent"],
    ["SchemaValidationAgent", "TripleValidationJoin"],
    ["FixtureValidationAgent", "TripleValidationJoin"],
    ["GoalValidationAgent", "TripleValidationJoin"],
    {
      source: "TripleValidationJoin",
      target: "TripleValidationRefineCheck",
      handler: () =>
        state.get<boolean>("oneshot.triple_valid") !== true &&
        !state.has(WORKFLOW_STATE.rootCause),
    },
    {
      source: "TripleValidationRefineCheck",
      target: "GapAnalysisRefine",
      handler: () => !state.has(WORKFLOW_STATE.rootCause),
    },
    ["GapAnalysisRefine", "ValidationRefineProgressCheck"],
    {
      source: "ValidationRefineProgressCheck",
      target: "ValidationRefineEvaluation",
      handler: () => !state.has(WORKFLOW_STATE.rootCause),
    },
    {
      source: "ValidationRefineEvaluation",
      target: "TripleValidationAdmission",
      handler: () => !state.has(WORKFLOW_STATE.rootCause),
    },
  ];

  const graph = new Graph({
    id: "TripleValidation",
    nodes,
    edges,
    sources: ["TripleValidationAdmission"],
    maxSteps: 256,
  });

  return { node: new MultiAgentNode({ orchestrator: graph }), nodes, edges };
}
