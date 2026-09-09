import {
  Graph,
  type EdgeDefinition,
  type MultiAgentNode,
  type NodeDefinition,
} from "@strands-agents/sdk/multiagent";
import type {
  HashProof,
  ResearchBundle,
  RootCause,
} from "../../contracts/schema/types.js";
import type { BuilderWorkflow } from "../../agents/builder/workflow.js";
import type { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import type { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import type { PlannerWorkflow } from "../../agents/planner/workflow.js";
import type { RefactorWorkflow } from "../../agents/refactor/workflow.js";
import type { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import type { ConfirmationWorkflow } from "../confirmation.js";
import type { HashWorkflow } from "../hash.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import { OneShotStageNode } from "./stage-node.js";
import { createGapAnalysisGraph } from "./gap-graph.js";
import { createTripleValidationGraph } from "./proof-graph.js";
import {
  WORKFLOW_STATE,
  WorkflowRunState,
  type WorkflowEffects,
  rootCauseDelta,
  requireJobId,
} from "./state.js";

export interface OneShotWorkflowDependencies {
  researcher: ResearcherWorkflow;
  planner: PlannerWorkflow;
  refactor: RefactorWorkflow;
  gapper: GapAnalysisWorkflow;
  evaluator: EvaluationWorkflow;
  triple: TripleValidationWorkflow;
  confirmation: ConfirmationWorkflow;
  hash: HashWorkflow;
  builder: BuilderWorkflow;
}

export interface OneShotCanonicalBuild {
  graph: Graph;
  state: WorkflowRunState;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  gap: {
    node: MultiAgentNode;
    nodes: NodeDefinition[];
    edges: EdgeDefinition[];
  };
  proof: {
    node: MultiAgentNode;
    nodes: NodeDefinition[];
    edges: EdgeDefinition[];
  };
}

/**
 * Build the canonical OneShot workflow as a real Strands Agents Graph.
 *
 * Strands owns stage ordering, parallel proof fan-out, the bounded gap and
 * validation-refinement cycles, and node lifecycle. Canonical OneShot agents
 * keep executing their own contracts; the two human review gates remain
 * server-side services reached through WorkflowEffects.
 */
export function createOneShotCanonicalWorkflow(
  deps: OneShotWorkflowDependencies,
  effects: WorkflowEffects,
): OneShotCanonicalBuild {
  const state = new WorkflowRunState();

  const researcher = new OneShotStageNode({
    id: "Researcher",
    description: "Activates and runs the canonical Researcher agent.",
    state,
    handler: async (run) => {
      const runId = requireJobId(run.runId(), "Researcher");
      effects.event(runId, "Researcher", "Running");
      const bundle = await deps.researcher.run(run.prompt(), runId);

      await effects.save(runId, "prompt", bundle.prompt);
      await effects.save(runId, "researcher", bundle.researcher);
      await effects.save(runId, "plan.researcher", bundle.plan);
      await effects.save(runId, "schema", bundle.schema_artifact);
      await effects.save(runId, "fixture", bundle.fixture);
      await effects.save(runId, "goal", bundle.goal);
      await effects.save(runId, "validation", bundle.validation);

      effects.event(runId, "Researcher", "Completed", {
        test_result: "Passed",
        artifact_id: bundle.researcher.researcher_id,
      });

      return {
        stateDelta: {
          [WORKFLOW_STATE.bundle]: bundle,
          [WORKFLOW_STATE.plan]: bundle.plan,
        },
      };
    },
  });

  const researchReview = new OneShotStageNode({
    id: "ResearchReviewGate",
    description:
      "Human gate: blocks until the Research Review baseline is explicitly accepted.",
    state,
    handler: async (run) => {
      const reviewed = await effects.review(run.runId(), run.bundle());
      return { stateDelta: { [WORKFLOW_STATE.bundle]: reviewed } };
    },
  });

  const planner = new OneShotStageNode({
    id: "Planner",
    description: "Activates and runs the canonical Planner review/audit agent.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "Planner", "Running");
      const audit = await deps.planner.run(run.bundle(), runId);
      await effects.save(runId, "audit", audit);
      effects.event(runId, "Planner", "Completed", {
        test_result: "Passed",
        artifact_id: audit.audit_id,
        message: `reviewed=${audit.reviewed_areas.length}; findings=${audit.findings.length}`,
      });
      return { stateDelta: { [WORKFLOW_STATE.audit]: audit } };
    },
  });

  const refactor = new OneShotStageNode({
    id: "Refactor",
    description: "Activates canonical Refactor while preserving logical plan_id.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "Refactor", "Running");
      const plan = await deps.refactor.run(run.bundle(), run.audit());
      const bundle: ResearchBundle = { ...run.bundle(), plan };
      await effects.save(runId, "plan.refactored", plan);
      effects.event(runId, "Refactor", "Completed", {
        test_result: "Passed",
        artifact_id: plan.plan_id,
        message: `plan_id preserved; revision=${plan.revision}`,
      });
      return {
        stateDelta: {
          [WORKFLOW_STATE.plan]: plan,
          [WORKFLOW_STATE.bundle]: bundle,
        },
      };
    },
  });

  const gapBuild = createGapAnalysisGraph(deps.gapper, effects, state);
  const gapAnalysis = gapBuild.node;

  const evaluation = new OneShotStageNode({
    id: "Evaluation",
    description: "Activates Evaluation and evaluates the final gap_0 plan.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "Evaluation", "Running");
      const result = await deps.evaluator.run(run.bundle(), run.plan());
      await effects.save(runId, "evaluation", result);
      effects.event(runId, "Evaluation", "Completed", {
        test_result: result.result,
        artifact_id: result.plan_id,
        message: `evidence=${result.evidence.length}`,
      });
      return {
        stateDelta: {
          [WORKFLOW_STATE.evaluation]: result,
          ...(result.root_cause ? rootCauseDelta(result.root_cause) : {}),
        },
      };
    },
  });

  const proofBuild = createTripleValidationGraph(
    deps.triple,
    deps.gapper,
    deps.evaluator,
    effects,
    state,
  );
  const tripleValidation = proofBuild.node;

  const confirmation = new OneShotStageNode({
    id: "Confirmed",
    description: "Creates the exact confirmed immutable package.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "Confirmed", "Running");
      const confirmed = await deps.confirmation.run(
        run.bundle(),
        run.plan(),
        run.audit(),
        run.gap(),
        run.evaluation(),
        run.tripleValidation(),
      );
      await effects.save(runId, "confirmed", confirmed);
      effects.event(runId, "Confirmed", "Completed", {
        test_result: "Passed",
        artifact_id: run.plan().plan_id,
      });
      return { stateDelta: { [WORKFLOW_STATE.confirmed]: confirmed } };
    },
  });

  const createHash = new OneShotStageNode({
    id: "CreateHash",
    description: "Creates H1 from the confirmed immutable core.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "CreateHash", "Running");
      const createdHash = await deps.hash.create(run.confirmed());
      await effects.save(runId, "confirmed-hash", { hash: createdHash });
      effects.event(runId, "CreateHash", "Completed", {
        test_result: "Passed",
        artifact_id: createdHash,
      });
      return { stateDelta: { [WORKFLOW_STATE.createdHash]: createdHash } };
    },
  });

  const buildReady = new OneShotStageNode({
    id: "BuildReadyGate",
    description:
      "Human gate: blocks until Confirm Build authorizes the exact package and hash.",
    state,
    handler: async (run) => {
      await effects.buildReview(
        run.runId(),
        run.confirmed(),
        run.createdHash(),
      );
      return;
    },
  });

  const builder = new OneShotStageNode({
    id: "Builder",
    description:
      "Activates Builder and executes the exact confirmed package through the governed sandbox.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      effects.event(runId, "Builder", "Running");
      const result = await deps.builder.run(run.confirmed(), run.createdHash());
      await effects.save(runId, "builder-result", result);
      effects.event(runId, "Builder", "Completed", {
        test_result: result.result,
        artifact_id: result.execution_id,
      });
      return {
        stateDelta: {
          [WORKFLOW_STATE.builderResult]: result,
          ...(result.result === "Failed"
            ? rootCauseDelta(result.root_cause)
            : {}),
        },
      };
    },
  });

  const hashVerification = new OneShotStageNode({
    id: "Hash",
    description:
      "Compares confirmation H1 with the sandbox-side recomputation of the same confirmed core.",
    state,
    handler: async (run) => {
      const runId = run.runId();
      const result = run.builderResult();
      if (result.result !== "Passed") return;

      effects.event(runId, "Hash", "Running");
      const proof = await deps.hash.proof(
        run.createdHash(),
        result.hash_sandbox,
      );
      await effects.save(runId, "hash-proof", proof);
      effects.event(runId, "Hash", "Completed", {
        test_result: proof.equal ? "Passed" : "Root Cause",
        ...(proof.equal ? {} : { issue_type: "Root Cause" }),
        artifact_id: proof.recomputed_hash,
        message: `equal=${proof.equal}`,
      });

      if (!proof.equal) {
        return {
          stateDelta: {
            [WORKFLOW_STATE.hashProof]: proof,
            ...rootCauseDelta({
              issue: "Hash verification mismatch",
              expected: proof.created_hash,
              actual: proof.recomputed_hash,
              evidence_ids: ["hash-proof"],
              required_correction:
                "Recompute the sandbox integrity hash from the exact confirmed immutable core",
              recheck_target: run.plan().plan_id,
            }),
          },
        };
      }

      return { stateDelta: { [WORKFLOW_STATE.hashProof]: proof } };
    },
  });

  const done = new OneShotStageNode({
    id: "Done",
    description: "Finalizes the OneShot run as PASSED or ROOT_CAUSE.",
    runAfterRootCause: true,
    state,
    handler: async (run) => {
      const runId = run.runId();
      const rootCause = run.rootCause();
      if (rootCause) {
        const proof = run.get<HashProof>(WORKFLOW_STATE.hashProof);
        effects.finishRoot(runId, rootCause, proof);
        return;
      }

      const proof = run.hashProof();
      if (!proof.equal) {
        throw new Error("Done reached without equal hash proof");
      }
      effects.finishPassed(runId, proof);
    },
  });

  const nodes: NodeDefinition[] = [
    researcher,
    researchReview,
    planner,
    refactor,
    gapAnalysis,
    evaluation,
    tripleValidation,
    confirmation,
    createHash,
    buildReady,
    builder,
    hashVerification,
    done,
  ];
  const edges: EdgeDefinition[] = [
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
  ];

  const graph = new Graph({
    id: "OneShotCanonicalWorkflow",
    nodes,
    edges,
    maxSteps: 512,
  });

  return {
    graph,
    state,
    nodes,
    edges,
    gap: gapBuild,
    proof: proofBuild,
  };
}
