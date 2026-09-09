import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { BuilderWorkflow } from "../../agents/builder/workflow.js";
import { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../../agents/planner/workflow.js";
import { RefactorWorkflow } from "../../agents/refactor/workflow.js";
import type { ResearchProvider } from "../../../app/web/cloud/provider.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import type { SandboxService } from "../../sandbox/sandbox-service.js";
import type { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";
import { ConfirmationWorkflow } from "../confirmation.js";
import { HashWorkflow } from "../hash.js";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import type { OneShotWorkflowDependencies } from "./canonical-workflow.js";

export interface DynamicDependencyFactoryInput {
  projectRoot: string;
  events: ProcessingEventBus;
  contracts: CanonicalContractSkill;
  sandbox: SandboxService;
  triple: TripleValidationWorkflow;
  provider: ResearchProvider;
  confirmation?: ConfirmationWorkflow;
  hash?: HashWorkflow;
}

export interface BoundOneShotDependencies
  extends OneShotWorkflowDependencies {
  release(): void | Promise<void>;
}

export type DependencyBinder = (
  runId: string,
) => Promise<BoundOneShotDependencies>;

/**
 * Resolve production dependencies for one Strands job. ResearchProvider
 * readiness is proved before the Researcher node is allowed to enter RUNNING.
 */
export function createDynamicDependencyFactory(
  input: DynamicDependencyFactoryInput,
) {
  const confirmation =
    input.confirmation ?? new ConfirmationWorkflow(input.contracts);
  const hash = input.hash ?? new HashWorkflow(input.contracts);

  return async (runId: string): Promise<BoundOneShotDependencies> => {
    input.events.emit(runId, "ProviderBinding:Researcher", "Running", {
      scope: "SUPPORT",
      message:
        "resolve provider and prove model readiness before the Strands Researcher node",
    });

    let provider: ResearchProvider | undefined;
    try {
      provider = input.provider;
      const readiness = await provider.ready(runId);
      if (!readiness.ready) {
        throw new WorkflowRootCauseError({
          issue: "Researcher provider binding is not ready",
          expected:
            "Configured ResearchProvider and required model bindings are ready before the Researcher node runs",
          actual: readiness.detail || "provider readiness returned false",
          evidence_ids: readiness.models.map((model) => `model:${model}`),
          required_correction:
            "Correct provider/model configuration and retry the same job",
          recheck_target: runId,
        });
      }

      input.events.emit(runId, "ProviderBinding:Researcher", "Completed", {
        scope: "SUPPORT",
        test_result: "Passed",
        artifact_id: `provider:${readiness.provider}`,
        message: `models=${readiness.models.join(",") || "fixture"}`,
      });

      const boundProvider = provider;
      return {
        researcher: new ResearcherWorkflow(boundProvider, input.contracts),
        planner: new PlannerWorkflow(input.contracts),
        refactor: new RefactorWorkflow(input.contracts),
        gapper: new GapAnalysisWorkflow(input.contracts),
        evaluator: new EvaluationWorkflow(input.contracts),
        triple: input.triple,
        confirmation,
        hash,
        builder: new BuilderWorkflow(input.sandbox),
        release() {
          boundProvider.close?.();
        },
      };
    } catch (error) {
      provider?.close?.();
      input.events.emit(runId, "ProviderBinding:Researcher", "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}
