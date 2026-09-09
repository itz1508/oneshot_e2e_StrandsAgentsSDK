#!/usr/bin/env node
/**
 * Standalone OneShot run-worker CLI.
 *
 * Runs the BullMQ Worker in a dedicated process. In the default
 * single-process deployment the server (backend/index.ts) constructs the
 * worker in-process, so this script is optional. It exists so the worker
 * can be detached/replicated without code changes.
 *
 * The worker reconstructs a per-job WorkflowRuntime from durable state and
 * emits live progress into the shared ProcessingEventBus. When run in-process
 * the bus is shared with the server; when detached, SSE reconnects to the
 * durable RunRepository snapshot.
 */

import "../environment.js";
import { resolve } from "node:path";
import { ProcessingEventBus } from "../runtime/event-bus.js";
import { RunRepository } from "../runtime/run-repository.js";
import { FileArtifactStore } from "../runtime/artifact-store.js";
import { AppendOnlyProcessingEventStore } from "../task/event/event-store.js";
import { CheckpointStore } from "../task/checkpoint/checkpoint-store.js";
import { TaskManagement } from "../task/task-management.js";
import { ProviderManager } from "../../app/web/cloud/provider-manager.js";
import { BullMQRunQueue, RUN_QUEUE_NAME, type RunQueueDeps } from "../runtime/queue.js";
import {
  getRuntimePaths,
  ensureRuntimeDirectories,
} from "../runtime/runtime-config.js";
import { WorkflowRuntime } from "../runtime/workflow-runtime.js";
import { createDynamicDependencyFactory } from "../workflow/strands/dependencies.js";
import { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import { PlannerWorkflow } from "../agents/planner/workflow.js";
import { RefactorWorkflow } from "../agents/refactor/workflow.js";
import { GapAnalysisWorkflow } from "../agents/gap-analysis/workflow.js";
import { EvaluationWorkflow } from "../agents/evaluation/workflow.js";
import { BuilderWorkflow } from "../agents/builder/workflow.js";
import { TripleValidationWorkflow } from "../workflow/triple-validation.js";
import { ConfirmationWorkflow } from "../workflow/confirmation.js";
import { HashWorkflow } from "../workflow/hash.js";
import { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import { createSkillSystem } from "../skills/bootstrap.js";
import { PythonBridge } from "../validation/python-bridge.js";
import { ValidationLanePool } from "../validation/validation-lane-pool.js";
import { DeterministicValidationRuntime } from "../validation/deterministic-validation.js";
import { SandboxService } from "../sandbox/sandbox-service.js";
import { HardenedProcessRunner } from "../sandbox/runner/process-runner.js";
import { ContainerSandboxRunner } from "../sandbox/runner/container-runner.js";

const projectRoot = process.env.ONESHOT_ROOT || process.cwd();
const runtimePaths = ensureRuntimeDirectories(getRuntimePaths(projectRoot));

const taskEventStore = new AppendOnlyProcessingEventStore(
  runtimePaths.taskEvents,
);
const events = new ProcessingEventBus(taskEventStore);
const runs = new RunRepository(runtimePaths.runState);
const task = new TaskManagement(
  taskEventStore,
  new CheckpointStore(runtimePaths.checkpoints),
);

events.observe((e) => {
  const snapshot = runs.get(e.run_id);
  if (!snapshot) return;
  runs.event(e.run_id, e);
  task.onEvent(e, runs.require(e.run_id));
});

async function main() {
  const bridge = new PythonBridge();
  const validationLanes = new ValidationLanePool();
  const skills = createSkillSystem();
  const runtimeCtx = {
    caller_id: "backend/run-worker",
    bridge,
    events,
    services: { task, runs } as Record<string, unknown>,
  };
  const contractsSkill = await skills.activation.activate(
    { skill_id: "oneshot-canonical-contracts" },
    runtimeCtx,
  );
  const contracts = contractsSkill.underlying as CanonicalContractSkill;
  await contracts.verifyStatic();

  const providerManager = new ProviderManager({
  projectRoot,
  runtimePaths,
});
  const deterministic = new DeterministicValidationRuntime(validationLanes);
  const sandbox = new SandboxService(
    contracts,
    events,
    process.env.ONESHOT_SANDBOX_RUNNER === "container"
      ? new ContainerSandboxRunner()
      : new HardenedProcessRunner(),
    runtimePaths.sandboxWorkspaces,
  );

  const queueDeps: RunQueueDeps = {
    runs,
    events,
    projectRoot,
    resolveProvider: async (providerId, _ev, _runId, captured) =>
      providerManager.resolveForRun(providerId, captured),
    createRuntime: async (provider) => {
      const bindDependencies = createDynamicDependencyFactory({
        projectRoot,
        events,
        contracts,
        sandbox,
        triple: new TripleValidationWorkflow(deterministic, contracts),
        provider,
      });
      return new WorkflowRuntime(
        events,
        runs,
        new FileArtifactStore(runtimePaths.runs),
        bindDependencies,
      );
    },
  };

  const worker = new BullMQRunQueue(RUN_QUEUE_NAME, queueDeps, {
    concurrency: Number(process.env.ONESHOT_RUN_CONCURRENCY || 1),
  });
  await worker.ready(Number(process.env.ONESHOT_QUEUE_READY_TIMEOUT || 8_000));
  console.log(`ONESHOT_RUN_WORKER_READY queue=${RUN_QUEUE_NAME}`);

  const shutdown = async () => {
    await worker.close();
    validationLanes.close();
    bridge.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("run-worker failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
