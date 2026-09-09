import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import { BuilderWorkflow } from "../agents/builder/workflow.js";
import { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import { PlannerWorkflow } from "../agents/planner/workflow.js";
import { RefactorWorkflow } from "../agents/refactor/workflow.js";
import type { ResearchProvider } from "../../app/web/cloud/provider.js";
import { resolveResearchProvider } from "../../app/web/cloud/provider-resolver.js";
import { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import type { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import { AgentPipeline } from "./agent-pipeline.js";

export interface AgentPipelineBootstrapInput {
  projectRoot: string;
  events: ProcessingEventBus;
  contracts: CanonicalContractSkill;
  sandbox: SandboxService;
}

/**
 * Register canonical Agent factories without activating them.
 * Activation is explicit and happens only when the Strands workflow reaches an Agent.
 */
export function createAgentPipeline(
  input: AgentPipelineBootstrapInput,
): AgentPipeline {
  const { projectRoot, events, contracts, sandbox } = input;
  const pipeline = new AgentPipeline(events);

  pipeline.register("Researcher", async (runId) => {
    events.emit(runId, "ProviderBinding:Researcher", "Running", {
      scope: "SUPPORT",
      message: "resolve and probe ResearchProvider",
    });

    let provider: ResearchProvider | undefined;
    try {
      provider = await resolveResearchProvider(projectRoot, events);
      const readiness = await provider.ready(runId);
      if (!readiness.ready) {
        throw new WorkflowRootCauseError({
          issue: "Researcher provider binding is not ready",
          expected:
            "The explicitly selected ResearchProvider and all required model bindings pass readiness before Researcher runs",
          actual: readiness.detail || "provider readiness returned false",
          evidence_ids: readiness.models.map((model) => `model:${model}`),
          required_correction:
            "Correct provider/model configuration and activate Researcher again",
          recheck_target: runId,
        });
      }

      events.emit(runId, "ProviderBinding:Researcher", "Completed", {
        scope: "SUPPORT",
        test_result: "Passed",
        artifact_id: `provider:${readiness.provider}`,
        message: `models=${readiness.models.join(",") || "fixture"}`,
      });

      const boundProvider = provider;
      return {
        agent_id: "Researcher" as const,
        runtime: new ResearcherWorkflow(boundProvider, contracts),
        deactivate: () => boundProvider.close?.(),
      };
    } catch (error) {
      provider?.close?.();
      events.emit(runId, "ProviderBinding:Researcher", "Completed", {
        scope: "SUPPORT",
        test_result: "Failed",
        issue_type: "Root Cause",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  pipeline.register("Planner", () => ({
    agent_id: "Planner" as const,
    runtime: new PlannerWorkflow(contracts),
  }));

  pipeline.register("Refactor", () => ({
    agent_id: "Refactor" as const,
    runtime: new RefactorWorkflow(contracts),
  }));

  pipeline.register("GapAnalysis", () => ({
    agent_id: "GapAnalysis" as const,
    runtime: new GapAnalysisWorkflow(contracts),
  }));

  pipeline.register("Evaluation", () => ({
    agent_id: "Evaluation" as const,
    runtime: new EvaluationWorkflow(contracts),
  }));

  pipeline.register("Builder", () => ({
    agent_id: "Builder" as const,
    runtime: new BuilderWorkflow(sandbox),
  }));

  return pipeline;
}
