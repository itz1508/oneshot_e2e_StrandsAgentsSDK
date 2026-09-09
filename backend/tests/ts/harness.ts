import { rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Prompt } from "../../contracts/schema/types.js";
import type { ResearchProvider } from "../../../app/web/cloud/provider.js";
import { AgentPipeline } from "../../pipeline/agent-pipeline.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import { CheckpointStore } from "../../task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "../../task/task-management.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { FileArtifactStore } from "../../runtime/artifact-store.js";
import { PythonBridge } from "../../validation/python-bridge.js";
import { ValidationLanePool } from "../../validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "../../validation/deterministic-validation.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { FixtureResearchProvider } from "../../../app/web/cloud/provider/fixture-provider.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { PlannerWorkflow } from "../../agents/planner/workflow.js";
import { RefactorWorkflow } from "../../agents/refactor/workflow.js";
import { GapAnalysisWorkflow } from "../../agents/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "../../agents/evaluation/workflow.js";
import { BuilderWorkflow } from "../../agents/builder/workflow.js";
import { TripleValidationWorkflow } from "../../workflow/triple-validation.js";
import { ConfirmationWorkflow } from "../../workflow/confirmation.js";
import { HashWorkflow } from "../../workflow/hash.js";
import { WorkflowRuntime } from "../../runtime/workflow-runtime.js";
import { SandboxService } from "../../sandbox/sandbox-service.js";
import type {
  RunnerExecutionResult,
  SandboxRunner,
} from "../../sandbox/runner/runner.js";
import type { ExecutionAuthorization } from "../../sandbox/types.js";
import type { Plan } from "../../contracts/schema/types.js";

class DeterministicTestSandboxRunner implements SandboxRunner {
  async execute(
    _sandboxId: string,
    _workspacePath: string,
    _plan: Plan,
    auth: ExecutionAuthorization,
  ): Promise<RunnerExecutionResult> {
    return {
      commands: ["echo OneShot deterministic Builder test"],
      exit_codes: [0],
      stdout_lines: ["OneShot deterministic Builder test"],
      stderr_lines: [],
      file_changes: [],
      bytes_written: 0,
      resource_usage: {
        duration_ms: 0,
        peak_memory_mb: 0,
        cpu_time_ms: 0,
      },
      environment_allowlist_used: [...auth.environment_allowlist],
      network_policy_used: auth.network_policy,
      cleanup_result: {
        workspace_cleaned: false,
        processes_terminated: true,
      },
      condition: "success",
    };
  }

  async cleanup(_sandboxId: string, workspacePath: string): Promise<boolean> {
    rmSync(workspacePath, { recursive: true, force: true });
    return true;
  }
}

export function prompt(runId: string): Prompt {
  return {
    prompt_id: `prompt:${runId}`,
    intent: "Run canonical sample",
    requested_outcome: "Reach DONE",
    context: [{ context_id: `ctx:${runId}`, statement: "E2E" }],
    research_direction: ["contracts"],
  };
}

export async function harness(
  name: string,
  provider?: ResearchProvider,
  sandboxRunner: SandboxRunner = new DeterministicTestSandboxRunner(),
) {
  const taskStore = new AppendOnlyProcessingEventStore(
    resolve(`.runtime/test-harness/task-events/${name}-${process.pid}`),
  );
  const events = new ProcessingEventBus(taskStore);
  const runs = new RunRepository(resolve(`.runtime/test-harness/state/${name}`));
  const task = new TaskManagement(
    taskStore,
    new CheckpointStore(resolve(`.runtime/test-harness/checkpoints/${name}-${process.pid}`)),
  );

  events.observe((e) => {
    const snapshot = runs.get(e.run_id);
    if (!snapshot) return;
    runs.event(e.run_id, e);
    task.onEvent(e, runs.require(e.run_id));
  });

  const researchProvider: ResearchProvider = provider || new FixtureResearchProvider();
  researchProvider.attachEvents?.(events);

  const bridge = new PythonBridge();
  const contracts = new CanonicalContractSkill(bridge);
  await contracts.verifyStatic();

  const validationLanes = new ValidationLanePool();
  const closeContractBridge = bridge.close.bind(bridge);
  bridge.close = () => {
    validationLanes.close();
    closeContractBridge();
  };

  const validation = new DeterministicValidationRuntime(validationLanes);
  const researcher = new ResearcherWorkflow(researchProvider, contracts);
  const planner = new PlannerWorkflow(contracts);
  const refactor = new RefactorWorkflow(contracts);
  const gapper = new GapAnalysisWorkflow(contracts);
  const evaluator = new EvaluationWorkflow(contracts);
  const triple = new TripleValidationWorkflow(validation, contracts);
  const confirmation = new ConfirmationWorkflow(contracts);
  const hash = new HashWorkflow(contracts);
  const store = new FileArtifactStore(resolve(`.runtime/test-harness/runs/${name}`));

  const sandbox = new SandboxService(
    contracts,
    events,
    sandboxRunner,
    resolve(`.runtime/test-harness/sandbox/${name}-${process.pid}`),
  );
  const builder = new BuilderWorkflow(sandbox);

  // Kept only for legacy unit tests of the superseded registry itself. The
  // production/test WorkflowRuntime below executes through Strands graph nodes.
  const pipeline = new AgentPipeline(events);
  pipeline.register("Researcher", () => ({ agent_id: "Researcher", runtime: researcher }));
  pipeline.register("Planner", () => ({ agent_id: "Planner", runtime: planner }));
  pipeline.register("Refactor", () => ({ agent_id: "Refactor", runtime: refactor }));
  pipeline.register("GapAnalysis", () => ({ agent_id: "GapAnalysis", runtime: gapper }));
  pipeline.register("Evaluation", () => ({ agent_id: "Evaluation", runtime: evaluator }));
  pipeline.register("Builder", () => ({ agent_id: "Builder", runtime: builder }));

  const runtime = new WorkflowRuntime(
    events,
    runs,
    store,
    async () => ({
      researcher,
      planner,
      refactor,
      gapper,
      evaluator,
      triple,
      confirmation,
      hash,
      builder,
      release() {},
    }),
  );

  return {
    events,
    runs,
    task,
    bridge,
    validationLanes,
    contracts,
    validation,
    researcher,
    planner,
    refactor,
    gapper,
    evaluator,
    triple,
    confirmation,
    hash,
    sandbox,
    builder,
    pipeline,
    store,
    runtime,
    close() {
      researchProvider.close?.();
      bridge.close();
    },
  };
}
