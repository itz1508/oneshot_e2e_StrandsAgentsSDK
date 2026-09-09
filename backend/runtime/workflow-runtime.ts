import type {
  HashProof,
  Prompt,
  RootCause,
  RunSnapshot,
} from "../contracts/schema/types.js";
import { WorkflowInformationRequiredError } from "../core/information-required-error.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { HelpRequest } from "../intent/types.js";
import { createOneShotCanonicalWorkflow } from "../workflow/strands/canonical-workflow.js";
import {
  WORKFLOW_STATE,
  type WorkflowEffects,
  requireJobId,
} from "../workflow/strands/state.js";
import type {
  BoundOneShotDependencies,
  DependencyBinder,
} from "../workflow/strands/dependencies.js";
import type { ArtifactStore } from "./artifact-store.js";
import type { ProcessingEventBus } from "./event-bus.js";
import type { RunRepository } from "./run-repository.js";
import { PlanReviewService } from "./plan-review.js";
import { BuildReviewService } from "./build-review.js";

function rootCauseShape(
  issue: string,
  expected: string,
  actual: string,
  evidenceIds: string[],
  correction: string,
  target: string,
): RootCause {
  return {
    issue,
    expected,
    actual,
    evidence_ids: evidenceIds,
    required_correction: correction,
    recheck_target: target,
  };
}

/** Convert unexpected Strands workflow failures to the canonical ROOT_CAUSE shape. */
export function toStrandsRootCause(error: unknown, jobId: string): RootCause {
  if (error instanceof WorkflowRootCauseError) return error.rootCause;
  return rootCauseShape(
    "Strands canonical workflow execution failed",
    "OneShot Strands canonical workflow reaches a canonical terminal result",
    error instanceof Error ? error.message : String(error),
    [],
    "Correct the reported Strands node, agent, provider, contract, or runtime boundary",
    jobId,
  );
}

/**
 * Orchestration wrappers (for example a failed multi-agent node result) retain
 * the original exception on `.error` or `.cause`. Unwrap that chain so
 * canonical OneShot ROOT_CAUSE and HelpRequest data survive node boundaries.
 */
function unwrapWorkflowError(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 16; depth += 1) {
    if (
      current instanceof WorkflowRootCauseError ||
      current instanceof WorkflowInformationRequiredError
    ) {
      return current;
    }
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);
    const record = current as { error?: unknown; cause?: unknown };
    const next = record.error ?? record.cause;
    if (next === undefined || next === current) break;
    current = next;
  }
  return current;
}

/**
 * External runtime facade for the canonical OneShot Strands Agents workflow.
 * Canonical agents are invoked inside Strands graph nodes; typed results flow
 * through shared run state; the two human review gates stay server-side.
 */
export class WorkflowRuntime {
  readonly review: PlanReviewService;
  readonly buildReview: BuildReviewService;

  constructor(
    private events: ProcessingEventBus,
    private runs: RunRepository,
    readonly store: ArtifactStore,
    private bindDependencies: DependencyBinder,
  ) {
    this.review = new PlanReviewService(store);
    this.buildReview = new BuildReviewService(store);
  }

  private ev(
    runId: string,
    processor: string,
    state: "Pending" | "Running" | "Completed" | "Failed",
    data: Parameters<ProcessingEventBus["emit"]>[3] = {},
  ): void {
    this.events.emit(runId, processor, state, data);
  }

  private async save(
    runId: string,
    name: string,
    value: unknown,
  ): Promise<string> {
    const path = await this.store.save(runId, name, value);
    this.runs.artifact(runId, name, path);
    return path;
  }

  private finishRoot(
    runId: string,
    rootCause: RootCause,
    proof?: HashProof,
    helpRequest?: HelpRequest,
  ): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.pipeline_status === "Done") return current;
    if (helpRequest) {
      this.ev(runId, "HelpRequest", "Running", { scope: "SUPPORT" });
      this.ev(runId, "HelpRequest", "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        issue: rootCause,
        artifact_id: helpRequest.request_id,
        message: helpRequest.question,
      });
    }
    this.ev(runId, "Done", "Running");
    this.ev(runId, "Done", "Completed", {
      test_result: "Failed",
      issue_type: "Root Cause",
      issue: rootCause,
      message: rootCause.actual,
    });
    return this.runs.finish(runId, "Failed", proof, rootCause, helpRequest);
  }

  private finishPassed(runId: string, proof: HashProof): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.pipeline_status === "Done") return current;
    this.ev(runId, "Done", "Running");
    this.ev(runId, "Done", "Completed", {
      test_result: "Passed",
      artifact_id: proof.created_hash,
    });
    return this.runs.finish(runId, "Passed", proof);
  }

  private effectsFor(): WorkflowEffects {
    return {
      buildReview: async (jobId, confirmed, hash) => {
        if (!(await this.buildReview.enabled(jobId))) return;
        await this.buildReview.open(jobId, confirmed, hash);
        this.ev(jobId, "BuildReady", "Running", {
          scope: "SUPPORT",
          message: "Confirmed package ready. Confirm Build to continue.",
        });
        await this.buildReview.wait(
          jobId,
          () => this.runs.get(jobId)?.pipeline_status === "Done",
        );
        await this.buildReview.requireApproved(jobId, confirmed, hash);
        this.ev(jobId, "BuildReady", "Completed", {
          scope: "SUPPORT",
          message: "Build authorized for the confirmed package.",
        });
      },
      review: async (jobId, research) => {
        if (!(await this.review.open(jobId, research))) return research;
        this.ev(jobId, "PlanReview", "Running", {
          scope: "SUPPORT",
          message: "Draft ready. Review and confirm before Planner continues.",
        });
        const reviewed = await this.review.wait(
          jobId,
          () => this.runs.get(jobId)?.pipeline_status === "Done",
        );
        await this.save(jobId, "plan.reviewed", reviewed.plan);
        await this.save(jobId, "research.reviewed", reviewed);
        this.ev(jobId, "PlanReview", "Completed", {
          scope: "SUPPORT",
          message: "Draft confirmed by the user.",
        });
        return reviewed;
      },
      event: (jobId, processor, state, data = {}) => {
        this.ev(jobId, processor, state, data);
      },
      save: (jobId, name, value) => this.save(jobId, name, value),
      finishPassed: (jobId, proof) => {
        this.finishPassed(jobId, proof);
      },
      finishRoot: (jobId, rootCause, proof) => {
        this.finishRoot(jobId, rootCause, proof);
      },
    };
  }

  /** Execute one complete canonical job through the Strands Agents workflow. */
  async run(runId: string, prompt: Prompt): Promise<RunSnapshot> {
    requireJobId(runId, "OneShot");
    const order = [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ];
    for (const processor of order) this.ev(runId, processor, "Pending");

    let bound: BoundOneShotDependencies | undefined;
    try {
      bound = await this.bindDependencies(runId);
      const { graph, state } = createOneShotCanonicalWorkflow(
        bound,
        this.effectsFor(),
      );
      state.set(WORKFLOW_STATE.runId, runId);
      state.set(WORKFLOW_STATE.prompt, prompt);

      const result = await graph.invoke(runId);

      const current = this.runs.require(runId);
      if (current.pipeline_status === "Done") return current;

      const rootCause = state.rootCause();
      if (rootCause) {
        return this.finishRoot(
          runId,
          rootCause,
          state.get<HashProof>(WORKFLOW_STATE.hashProof),
        );
      }
      if (result.status === "FAILED" || result.status === "CANCELLED") {
        const failedNode = (result.results ?? []).find(
          (nodeResult) =>
            nodeResult.status === "FAILED" || nodeResult.status === "CANCELLED",
        );
        const underlying =
          failedNode?.error ??
          result.error ??
          new Error("Strands workflow failed without a node error");
        return this.finishRoot(
          runId,
          toStrandsRootCause(underlying, runId),
          undefined,
          underlying instanceof WorkflowInformationRequiredError
            ? underlying.helpRequest
            : undefined,
        );
      }
      throw new Error(
        "Strands canonical workflow completed without a terminal result",
      );
    } catch (error) {
      const current = this.runs.require(runId);
      if (current.pipeline_status === "Done") return current;
      const underlying = unwrapWorkflowError(error);
      return this.finishRoot(
        runId,
        toStrandsRootCause(underlying, runId),
        undefined,
        underlying instanceof WorkflowInformationRequiredError
          ? underlying.helpRequest
          : undefined,
      );
    } finally {
      await bound?.release();
    }
  }
}
