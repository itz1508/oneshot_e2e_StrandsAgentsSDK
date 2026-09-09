import { body, json, mime } from "./http-response.js";
import { buildFileTree, computeWorkspaceInfo } from "./workspace-inspection.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { basename, join, normalize, resolve, sep } from "node:path";
import type { Prompt, RootCause } from "../contracts/schema/types.js";
import { id, newRunId } from "../core/id.js";
import { RunRepository } from "../runtime/run-repository.js";
import { ProcessingEventBus } from "../runtime/event-bus.js";
import { WorkflowRuntime } from "../runtime/workflow-runtime.js";
import { PlanReviewError } from "../runtime/plan-review.js";
import { BuildReviewError } from "../runtime/build-review.js";
import { TargetWorkspaceError } from "../runtime/target-workspace.js";
import type { TaskManagement } from "../task/task-management.js";
import {
  QUEUE_PREFIX,
  RUN_QUEUE_NAME,
  type RunQueue,
  type RunJobV1,
} from "../runtime/queue.js";
import type { ProviderManager } from "../../app/web/cloud/provider-manager.js";
import type { ProviderRuntimeSettings } from "../../app/web/cloud/provider-runtime-config.js";
import type { ProviderCredential } from "../../app/web/cloud/provider-secret-store.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import { getProducerRedis } from "../runtime/redis-connection.js";
import {
  confirmPlan as pipelineConfirmPlan,
  enqueueStage,
  saveArtifact,
  getCurrentResearchRevision,
  incrementResearchRevision,
  PipelineIdempotency,
  type PipelineStage,
  type PipelineHistory,
  type ConfirmPlanResult,
  type PlanReviewEdits,
} from "../pipeline/index.js";
import { projectStrandsGraph } from "../graph/strands-graph.js";
import { projectAuthorityGraph } from "../graph/authority-graph.js";
import { projectIntentGraph } from "../graph/intent-graph.js";
import type { IntentCollectionService } from "../intent/intent-collection.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import { projectSandboxGraph } from "../sandbox/graph/sandbox-graph.js";
import type { SandboxExecutionInput } from "../sandbox/types.js";
import { HttpSecurity } from "./http-security.js";
import {
  WorkspacePathDeniedError,
  WorkspacePathPolicy,
  WorkspacePathTraversalError,
  isSensitiveWorkspacePath,
} from "./workspace-path-policy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Mark a run as failed/queue-unavailable when ONESHOT_QUEUE_REQUIRED is active
 * and BullMQ/Redis could not accept the job. The run is finalized as ROOT_CAUSE
 * so it never lingers as a permanent "queued" ghost. No secrets in the event.
 */
function markRunQueueUnavailable(
  runId: string,
  runs: RunRepository,
  events: ProcessingEventBus,
): void {
  const rootCause: RootCause = {
    issue: "runtime queue unavailable",
    expected: "Redis/BullMQ available to accept the run job",
    actual:
      "Queue unavailable with ONESHOT_QUEUE_REQUIRED=true (no silent inline execution outside BullMQ)",
    evidence_ids: [],
    required_correction:
      "Start Redis/BullMQ, or set ONESHOT_QUEUE_REQUIRED=false for local inline execution",
    recheck_target: runId,
  };
  const snap = runs.get(runId);
  if (snap && snap.pipeline_status !== "Done") {
    runs.finish(runId, "Failed", undefined, rootCause);
  }
  events.emit(runId, "RunWorker", "Completed", {
    scope: "SUPPORT",
    test_result: "Failed",
    issue_type: "Root Cause",
    issue: rootCause,
    message: "runtime queue unavailable",
  });
}

/** Valid stage names accepted by the diagnostic reconcile endpoint. */
const PIPELINE_STAGE_NAMES = new Set<string>([
  "researcher",
  "planner",
  "refactor",
  "gap-analysis",
  "evaluation",
  "triple-validation",
  "confirmation",
  "hash",
  "build",
  "finalize",
]);

function workspacePolicyError(res: ServerResponse, error: unknown): boolean {
  if (error instanceof WorkspacePathTraversalError) {
    json(res, 400, { error: error.message });
    return true;
  }
  if (error instanceof WorkspacePathDeniedError) {
    json(res, 403, { error: error.message });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export interface RuntimeInfo {
  mode: string;
  provider: string;
  /** Whether the BullMQ run queue (Redis) is available. */
  queue?: boolean;
}

/**
 * Minimal interface for the per-stage BullMQ pipeline. When supplied, the HTTP
 * layer uses it for run submission and plan confirmation instead of the legacy
 * ADK single-queue runtime.
 */
export interface PipelineApi {
  queueReady: boolean;
  enqueue: (runId: string, stage: PipelineStage) => Promise<string>;
  confirmPlan: (
    runId: string,
    edits?: PlanReviewEdits,
  ) => Promise<ConfirmPlanResult>;
  store: ArtifactStore;
  history: PipelineHistory;
  getQueueCounts?: () => Promise<{
    waiting: number;
    active: number;
    failed: number;
  }>;
  /**
   * Diagnostic recovery for an executed stage whose transition did not
   * commit (crash window). Exposed via POST /api/runs/:id/reconcile.
   */
  reconcile?: (
    runId: string,
    stage: PipelineStage,
    iteration: number,
  ) => Promise<{ recovered: boolean; reason: string }>;
}

export interface HttpServerOptions {
  workspaceRoot?: string;
  executeInline?: (job: RunJobV1) => Promise<unknown>;
  /** Pipeline backend; when present, run submission uses per-stage queues. */
  pipeline?: PipelineApi;
  /** Target workspace service for explicit project selection and upload materialization. */
  targetWorkspace?: import("../runtime/target-workspace.js").TargetWorkspaceService;
}

export async function startHttpServer(
  runtime: WorkflowRuntime,
  runs: RunRepository,
  events: ProcessingEventBus,
  uiRoot: string,
  port = Number(process.env.PORT || 8787),
  task?: TaskManagement,
  intent?: IntentCollectionService,
  sandbox?: SandboxService,
  runtimeInfo?: RuntimeInfo,
  options: HttpServerOptions = {},
  /**
   * Optional BullMQ run queue. When present, `POST /api/runs` enqueues the run
   * instead of executing inline. When absent (e.g. tests), runs execute inline
   * via `runtime`, preserving the original behavior.
   */
  runQueue?: RunQueue,
  providerManager?: ProviderManager,
  queueReady?: boolean,
): Promise<ReturnType<typeof createServer>> {
  const bindHost =
    (process.env.ONESHOT_BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const apiToken = (process.env.ONESHOT_API_TOKEN || "").trim();
  if (bindHost !== "127.0.0.1" && bindHost !== "::1" && !apiToken) {
    throw new Error(
      `ROOT_CAUSE: non-loopback ONESHOT_BIND_HOST '${bindHost}' requires ONESHOT_API_TOKEN`,
    );
  }
  const security = new HttpSecurity();
  const workspaceRoot = resolve(
    options.workspaceRoot ||
      process.env.ONESHOT_WORKSPACE_ROOT ||
      process.cwd(),
  );
  const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot);

  async function submitRun(
    runId: string,
    prompt: Prompt,
    res: ServerResponse,
    extra: Record<string, unknown> = {},
    reviewPlan = false,
  ) {
    const pipeline = options.pipeline;
    const legacyQueueReady = runQueue && queueReady;
    const queueRequired = process.env.ONESHOT_QUEUE_REQUIRED === "true";

    if (queueRequired && !pipeline?.queueReady && !legacyQueueReady) {
      runs.create(runId);
      markRunQueueUnavailable(runId, runs, events);
      return json(res, 503, {
        error: "runtime queue unavailable",
        run_id: runId,
      });
    }

    let selector;
    try {
      selector = providerManager?.captureForRun() ?? {
        id: "sample",
        configRevision: 0,
        model: "fixture",
      };
    } catch {
      return json(res, 409, {
        error: "Configure and activate a provider before starting a run",
      });
    }

    runs.create(runId);

    if (reviewPlan) {
      await runtime?.review?.enable?.(runId);
      await runtime?.buildReview?.enable?.(runId);
    }

    // Per-stage BullMQ pipeline (new default when configured).
    if (pipeline?.queueReady) {
      try {
        const ctx = { runId, runs, store: pipeline.store };
        await saveArtifact(ctx, "prompt", prompt);
        await saveArtifact(ctx, "provider", selector);
        await runtime?.store?.save?.(runId, "execution-mode", {
          mode: "pipeline",
        });
        await pipeline.enqueue(runId, "researcher");
        return json(res, 202, {
          run_id: runId,
          queued: true,
          pipeline: true,
          ...extra,
        });
      } catch (e) {
        if (queueRequired) {
          markRunQueueUnavailable(runId, runs, events);
          return json(res, 503, {
            error: "pipeline queue unavailable",
            run_id: runId,
          });
        }
        // Otherwise fall through to legacy path so local dev without Redis still works.
      }
    }

    // Legacy ADK single-queue runtime (kept for tests and gradual migration).
    await runtime?.store?.save?.(runId, "execution-mode", { mode: "inline" });
    const job: RunJobV1 = {
      version: 1,
      runId,
      prompt,
      provider: selector,
      submittedAt: new Date().toISOString(),
    };
    if (legacyQueueReady) {
      try {
        await runQueue.addRun({
          runId,
          prompt,
          providerId: selector.id,
          revision: selector.configRevision,
          model: selector.model,
          settings: "settings" in selector ? selector.settings : undefined,
        });
        return json(res, 202, { run_id: runId, queued: true, ...extra });
      } catch {
        if (queueRequired) {
          markRunQueueUnavailable(runId, runs, events);
          return json(res, 503, {
            error: "runtime queue unavailable",
            run_id: runId,
          });
        }
      }
    }
    if (options.executeInline) void options.executeInline(job);
    else void runtime.run(runId, prompt);
    return json(res, 202, { run_id: runId, queued: false, ...extra });
  }

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      security.headers(res);
      if (!security.allowed(req, res)) return;

      try {
        const url = new URL(req.url || "/", "http://localhost");

        // ---------------------------------------------------------------
        // Workspace Tree & File Endpoints (for OneShot IDE Explorer & Viewer)
        // ---------------------------------------------------------------
        if (
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/tree" ||
            url.pathname === "/api/workspace/tree")
        ) {
          const reqPath = url.searchParams.get("path") || ".";
          const depthParam = url.searchParams.get("depth");
          const maxDepth = depthParam === null ? undefined : Number(depthParam);
          if (
            maxDepth !== undefined &&
            (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 100)
          ) {
            return json(res, 400, {
              error: "depth must be an integer from 1 to 100",
            });
          }
          try {
            const nodes = await buildFileTree(
              workspacePolicy,
              reqPath,
              "",
              0,
              maxDepth,
            );
            return json(res, 200, {
              root: reqPath,
              path: reqPath,
              depth: maxDepth ?? null,
              nodes,
              children: nodes,
            });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            throw error;
          }
        }

        if (
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/info" ||
            url.pathname === "/api/workspace/info")
        ) {
          try {
            const info = await computeWorkspaceInfo(
              workspacePolicy,
              workspaceRoot,
            );
            return json(res, 200, info);
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            throw error;
          }
        }

        if (
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/file" ||
            url.pathname === "/api/workspace/file")
        ) {
          const reqPath = url.searchParams.get("path") || "";
          if (!reqPath)
            return json(res, 400, { error: "path parameter required" });
          try {
            const targetFile = await workspacePolicy.authorizeExisting(reqPath);
            const data = await readFile(targetFile, "utf-8");
            return json(res, 200, { path: reqPath, content: data });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            return json(res, 404, { error: `File not found: ${reqPath}` });
          }
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/v1/workspace/file" ||
            url.pathname === "/api/workspace/file")
        ) {
          const b = await body(req);
          const filePath = String(b.path || "");
          const content = String(b.content ?? "");
          if (!filePath)
            return json(res, 400, { error: "path parameter required" });
          try {
            const targetFile = await workspacePolicy.authorizeWrite(filePath);
            await writeFile(targetFile, content, "utf-8");
            return json(res, 200, { ok: true, path: filePath });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            throw error;
          }
        }

        if (
          req.method === "GET" &&
          (url.pathname === "/v1/status" || url.pathname === "/api/status")
        ) {
          return json(res, 200, {
            statuses: [],
            total: 0,
            color_summary: {},
            cached: false,
          });
        }

        // ---------------------------------------------------------------
        // Health
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/health") {
          const activeId =
            providerManager?.runtimeConfig().activeProvider || "<default>";
          const mode =
            providerManager?.mode ?? runtimeInfo?.mode ?? "production";
          const publicName =
            providerManager?.publicNameFor(activeId) || "<default>";
          const pipelineReady = options.pipeline?.queueReady ?? false;
          const legacyReady = Boolean(runQueue && queueReady);
          const anyQueueReady = pipelineReady || legacyReady;
          const redis: "ok" | "unavailable" | "disabled" = !(
            runQueue || options.pipeline
          )
            ? "disabled"
            : anyQueueReady
              ? "ok"
              : "unavailable";
          const queue: "ok" | "unavailable" | "disabled" = !(
            runQueue || options.pipeline
          )
            ? "disabled"
            : anyQueueReady
              ? "ok"
              : "unavailable";
          const worker = options.pipeline
            ? pipelineReady
              ? await checkWorkerHealth(true)
              : "degraded"
            : !runQueue
              ? "disabled"
              : legacyReady
                ? "ok"
                : "degraded";
          let providerConfiguration:
            | "configured"
            | "unconfigured"
            | "sample"
            | "degraded"
            | "disabled" = "disabled";
          if (providerManager) {
            try {
              if (activeId === "<default>") {
                providerConfiguration = "unconfigured";
              } else if (activeId === "sample" && mode !== "production") {
                providerConfiguration = "sample";
              } else {
                const status = await providerManager.get(activeId);
                providerConfiguration = status?.credential?.configured
                  ? "configured"
                  : "degraded";
              }
            } catch {
              providerConfiguration = "degraded";
            }
          }
          const infraOk =
            (redis === "ok" || redis === "disabled") &&
            (queue === "ok" || queue === "disabled") &&
            (worker === "ok" || worker === "disabled");
          const status =
            infraOk && providerConfiguration !== "degraded" ? "ok" : "degraded";
          return json(res, 200, {
            status,
            workflow: "oneshot-canonical-workflow",
            mode,
            provider: publicName,
            redis,
            queue,
            worker,
            providerConfiguration,
            run_queue: {
              enabled: Boolean(runQueue || options.pipeline),
              redis_available: anyQueueReady,
              pipeline: Boolean(options.pipeline),
              legacy: Boolean(runQueue),
            },
            runtime: {
              preferred: "pipeline",
              pipeline: {
                available: Boolean(options.pipeline),
                active: pipelineReady,
              },
              legacy: {
                available: Boolean(runQueue),
                active: Boolean(!pipelineReady && queueReady),
              },
            },
            task_management: Boolean(task),
            intent_collection: Boolean(intent),
            sandbox_service: Boolean(sandbox),
            provider_management: Boolean(providerManager),
            strands_graph: "oneshot-strands-researcher-v1",
            authority_graph: "oneshot-authority-trace-v1",
            sandbox_graph: "oneshot-sandbox-execution-v1",
          });
        }

        // ---------------------------------------------------------------
        // Queue status (operational; never exposes Redis host/credentials)
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/runtime/queue") {
          const backend = "bullmq";

          // Per-stage pipeline queue takes precedence.
          if (options.pipeline) {
            const queueName = "oneshot-pipeline";
            const ready = options.pipeline.queueReady;
            let redis: "ok" | "unavailable" = ready ? "ok" : "unavailable";
            let waiting = 0;
            let active = 0;
            let failed = 0;
            if (ready && options.pipeline.getQueueCounts) {
              try {
                const c = await options.pipeline.getQueueCounts();
                waiting = c.waiting;
                active = c.active;
                failed = c.failed;
              } catch {
                redis = "unavailable";
              }
            }
            return json(res, 200, {
              available: ready && redis === "ok",
              backend,
              redis,
              queue: queueName,
              waiting,
              active,
              failed,
              pipeline: true,
            });
          }

          const queueName = `${QUEUE_PREFIX}:${RUN_QUEUE_NAME}`;
          if (!runQueue) {
            return json(res, 200, {
              available: false,
              backend,
              redis: "disabled",
              queue: queueName,
              waiting: 0,
              active: 0,
              failed: 0,
            });
          }
          let redis: "ok" | "unavailable" = queueReady ? "ok" : "unavailable";
          let waiting = 0;
          let active = 0;
          let failed = 0;
          if (queueReady && runQueue.getJobCounts) {
            try {
              const c = await runQueue.getJobCounts();
              waiting = c.waiting;
              active = c.active;
              failed = c.failed;
            } catch {
              redis = "unavailable";
            }
          }
          return json(res, 200, {
            available: queueReady && redis === "ok",
            backend,
            redis,
            queue: queueName,
            waiting,
            active,
            failed,
          });
        }

        // ---------------------------------------------------------------
        // Static graphs (no run context)
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/graphs/strands") {
          return json(res, 200, projectStrandsGraph());
        }
        if (req.method === "GET" && url.pathname === "/api/graphs/authority") {
          return json(res, 200, projectAuthorityGraph());
        }
        if (req.method === "GET" && url.pathname === "/api/graphs/sandbox") {
          return json(res, 200, projectSandboxGraph());
        }

        // ---------------------------------------------------------------
        // Conversation / Intent endpoints
        // ---------------------------------------------------------------

        // POST /api/conversations â€” start a new conversation
        if (req.method === "POST" && url.pathname === "/api/conversations") {
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          const input = await body(req);
          const c = intent.start(
            String(input.message || input.user_message || ""),
          );
          return json(res, 201, c);
        }

        // POST /api/conversations/:id/messages â€” add a turn
        const convMsg = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/messages$/,
        );
        if (req.method === "POST" && convMsg) {
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          const input = await body(req);
          const message = String(input.message || input.user_message || "");
          const runId = input.run_id ? String(input.run_id) : undefined;
          const intentKind = String(input.intent_kind || "normal");

          if (intentKind !== "normal" && intentKind !== "research-again") {
            return json(res, 400, {
              error: `intent_kind "${intentKind}" is not supported yet`,
            });
          }

          if (intentKind === "research-again") {
            if (!runId) {
              return json(res, 400, {
                error: "run_id is required for research-again",
              });
            }
            const snapshot = runs.get(runId);
            if (!snapshot) return json(res, 404, { error: "run not found" });
            if (snapshot.pipeline_status === "Done") {
              return json(res, 409, { error: "Run has already finished" });
            }

            const redis = getProducerRedis();
            const idempotency = new PipelineIdempotency(redis);
            const currentRevision = await getCurrentResearchRevision(
              redis,
              runId,
            );
            if (
              !(await idempotency.isCompleted(
                runId,
                "researcher",
                currentRevision,
              ))
            ) {
              return json(res, 409, {
                error: `Research revision ${currentRevision} is not complete; cannot request Research Again`,
              });
            }

            const confirmationKey = `oneshot:run:${runId}:plan-confirmed`;
            if ((await redis.exists(confirmationKey)) === 1) {
              return json(res, 409, {
                error: "Plan has already been confirmed for this run",
              });
            }

            try {
              const conversationSnapshot = intent.addTurn(
                decodeURIComponent(convMsg[1]),
                message,
              );
              const nextRevision = await incrementResearchRevision(
                redis,
                runId,
              );
              await enqueueStage(runId, "researcher", undefined, nextRevision);
              events.emit(runId, "ResearchAgain", "Completed", {
                scope: "SUPPORT",
                message: `Research Again requested; enqueued researcher revision ${nextRevision}`,
              });
              return json(res, 200, {
                ...conversationSnapshot,
                action: { kind: "research-again", revision: nextRevision },
              });
            } catch (e) {
              return json(res, 500, {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }

          // Normal chat turn. When a run is active, record a SUPPORT event so the
          // message stays associated with the job without mutating plan/state.
          try {
            const conversationSnapshot = intent.addTurn(
              decodeURIComponent(convMsg[1]),
              message,
            );
            if (runId) {
              const snapshot = runs.get(runId);
              if (snapshot && snapshot.pipeline_status !== "Done") {
                events.emit(runId, "ChatMessage", "Completed", {
                  scope: "SUPPORT",
                  message,
                });
              }
            }
            return json(res, 200, conversationSnapshot);
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/conversations/:id/prompt â€” attempt prompt creation
        const convPrompt = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/prompt$/,
        );
        if (req.method === "POST" && convPrompt) {
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          const cid = decodeURIComponent(convPrompt[1]);
          try {
            const r = intent.createPrompt(cid, id("prompt", cid));
            return json(res, r.result === "Passed" ? 200 : 409, r);
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/conversations/:id/run â€” create prompt and start workflow
        const convRun = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/run$/,
        );
        if (req.method === "POST" && convRun) {
          const options = await body(req);
          if (
            options.review_plan !== undefined &&
            typeof options.review_plan !== "boolean"
          )
            return json(res, 400, { error: "review_plan must be boolean" });
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          const cid = decodeURIComponent(convRun[1]);
          const runId = newRunId();

          let made;
          try {
            made = intent.createPrompt(cid, id("prompt", runId));
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }

          if (made.result !== "Passed") return json(res, 409, made);

          return submitRun(
            runId,
            made.prompt,
            res,
            {
              prompt_id: made.prompt.prompt_id,
              intent_id: made.intent.intent_id,
              intent_revision: made.intent.revision,
            },
            options.review_plan === true,
          );
        }

        // GET /api/conversations/:id/graph â€” intent graph projection
        const convGraph = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/graph$/,
        );
        if (req.method === "GET" && convGraph) {
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          return json(
            res,
            200,
            projectIntentGraph(intent.get(decodeURIComponent(convGraph[1]))),
          );
        }

        // GET /api/conversations/:id â€” get conversation snapshot
        const convGet = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
        if (req.method === "GET" && convGet) {
          if (!intent)
            return json(res, 503, { error: "intent collection unavailable" });
          const c = intent.get(decodeURIComponent(convGet[1]));
          return c
            ? json(res, 200, c)
            : json(res, 404, { error: "conversation not found" });
        }

        // ---------------------------------------------------------------
        // Run endpoints
        // ---------------------------------------------------------------

        // POST /api/runs â€” start a new run (direct prompt, no conversation)
        if (req.method === "POST" && url.pathname === "/api/runs") {
          const input = await body(req);
          const runId = newRunId();
          const prompt: Prompt = {
            prompt_id: id("prompt", runId),
            intent: String(input.intent || "Run canonical success sample"),
            requested_outcome: String(
              input.requested_outcome ||
                "Execute the complete canonical workflow through DONE",
            ),
            context: [
              {
                context_id: id("ctx", runId),
                statement: String(
                  input.context || "Fresh OneShot canonical product runtime",
                ),
              },
            ],
            research_direction: Array.isArray(input.research_direction)
              ? input.research_direction.map(String)
              : ["contracts", "proof"],
          };

          return submitRun(runId, prompt, res);
        }

        // ---------------------------------------------------------------
        // Run cancellation â€” DELETE /api/runs/:id
        // Distinguishes queued-job cancellation from active-workflow
        // cancellation and from browser SSE disconnect. Closing the browser
        // only unsubscribes SSE (see the events handler) â€” it NEVER cancels
        // the BullMQ job. Active cancellation is NOT supported until
        // WorkflowRuntime supports cooperative cancellation; report honestly.
        // ---------------------------------------------------------------
        const runCancel = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
        if (req.method === "DELETE" && runCancel) {
          const runId = decodeURIComponent(runCancel[1]);
          const snap = runs.get(runId);
          if (!snap) return json(res, 404, { error: "run not found" });
          if (!runQueue) {
            return json(res, 501, {
              error: "cancellation not available (run queue disabled)",
              run_id: runId,
            });
          }
          try {
            const job = await runQueue.getJob(runId);
            if (!job) {
              return json(res, 200, {
                run_id: runId,
                canceled: false,
                state:
                  snap.pipeline_status === "Done" ? "terminal" : "not-queued",
              });
            }
            const state = await runQueue.getJobState(runId);
            if (state === "waiting" || state === "delayed") {
              await job.remove();
              return json(res, 200, {
                run_id: runId,
                canceled: true,
                state: "queued",
              });
            }
            if (state === "active") {
              return json(res, 501, {
                error: "active cancellation not supported",
                run_id: runId,
                state: "active",
              });
            }
            return json(res, 200, {
              run_id: runId,
              canceled: false,
              state,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/runs/:id/confirm-plan â€” human gate after Researcher
        const runConfirmPlan = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/confirm-plan$/,
        );
        if (req.method === "POST" && runConfirmPlan) {
          const runId = decodeURIComponent(runConfirmPlan[1]);
          const snap = runs.get(runId);
          if (!snap) return json(res, 404, { error: "run not found" });
          if (snap.pipeline_status === "Done")
            return json(res, 409, { error: "Run has already finished" });
          if (!options.pipeline?.queueReady) {
            return json(res, 501, {
              error: "plan confirmation requires the per-stage pipeline",
              run_id: runId,
            });
          }
          try {
            const input = await body(req);
            const result = await options.pipeline.confirmPlan(
              runId,
              input.edits as PlanReviewEdits | undefined,
            );
            return json(res, 202, {
              run_id: runId,
              status: result.status,
              planner_queued: result.plannerQueued,
              next_stage: "planner",
            });
          } catch (e) {
            const status =
              e instanceof Error &&
              e.message.includes("Researcher stage has not completed")
                ? 409
                : e instanceof Error && e.message.includes("Review")
                  ? 400
                  : 500;
            return json(res, status, {
              error: e instanceof Error ? e.message : String(e),
              run_id: runId,
            });
          }
        }

        // POST /api/runs/:id/reconcile â€” diagnostic recovery for an executed
        // stage whose transition is missing or stuck pending after a crash.
        const runReconcile = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/reconcile$/,
        );
        if (req.method === "POST" && runReconcile) {
          const runId = decodeURIComponent(runReconcile[1]);
          const snap = runs.get(runId);
          if (!snap) return json(res, 404, { error: "run not found" });
          if (!options.pipeline?.reconcile) {
            return json(res, 501, {
              error: "reconciliation requires the per-stage pipeline",
              run_id: runId,
            });
          }
          const input = await body(req);
          const stage = String(input.stage ?? "");
          if (!PIPELINE_STAGE_NAMES.has(stage)) {
            return json(res, 400, {
              error: `unknown pipeline stage '${stage}'`,
              run_id: runId,
            });
          }
          const iteration = Number(input.iteration ?? 0);
          try {
            const result = await options.pipeline.reconcile(
              runId,
              stage as PipelineStage,
              Number.isFinite(iteration) && iteration >= 0
                ? Math.floor(iteration)
                : 0,
            );
            return json(res, 200, {
              run_id: runId,
              stage,
              iteration:
                Number.isFinite(iteration) && iteration >= 0
                  ? Math.floor(iteration)
                  : 0,
              ...result,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
              run_id: runId,
            });
          }
        }

        // GET /api/runs/:id/history â€” deterministic per-stage execution log
        const runHistory = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/history$/,
        );
        if (req.method === "GET" && runHistory) {
          const runId = decodeURIComponent(runHistory[1]);
          const snap = runs.get(runId);
          if (!snap) return json(res, 404, { error: "run not found" });
          if (!options.pipeline?.queueReady) {
            return json(res, 501, {
              error: "pipeline history requires the per-stage pipeline",
              run_id: runId,
            });
          }
          try {
            const history = await options.pipeline.history.list(runId);
            return json(res, 200, {
              run_id: runId,
              history,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
              run_id: runId,
            });
          }
        }

        // ---------------------------------------------------------------
        // Provider management endpoints (web-managed configuration)
        // ---------------------------------------------------------------
        //
        // GET /api/providers â€” catalog + non-secret runtime status (no secrets)
        if (req.method === "GET" && url.pathname === "/api/providers") {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          try {
            const statuses = await providerManager.list();
            const rc = providerManager.runtimeConfig();
            return json(res, 200, {
              version: providerManager.runtimeConfig().version,
              providers: statuses,
              activeProvider: rc.activeProvider,
              advancedResearch: {
                tavily: {
                  configured: Boolean(process.env.TAVILY_API_KEY),
                  enabled:
                    Boolean(process.env.TAVILY_API_KEY) &&
                    process.env.ONESHOT_TAVILY_MODE !== "off",
                },
              },
              revision: rc.revision ?? 0,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // GET /api/providers/:id â€” status only (never returns a credential)
        const providerGet = url.pathname.match(/^\/api\/providers\/([^/]+)$/);
        if (req.method === "GET" && providerGet) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerGet[1]);
          try {
            const status = await providerManager.get(pid);
            if (!status)
              return json(res, 404, { error: `Unknown provider: ${pid}` });
            return json(res, 200, status);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("Unknown provider") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // PUT /api/providers/:id/credential â€” submit a credential (WRITE ONLY)
        // The browser may submit a credential but can never retrieve it.
        const providerCredPut = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/credential$/,
        );
        if (req.method === "PUT" && providerCredPut) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerCredPut[1]);
          const status = await providerManager.get(pid);
          if (!status)
            return json(res, 404, { error: `Unknown provider: ${pid}` });
          const entry = status; // Use status for credential check
          if (entry.credential?.type === "none")
            return json(res, 400, {
              error: "provider does not require a credential",
            });
          const credBody = await body(req);
          const value =
            typeof (credBody.value ?? credBody.apiKey) === "string"
              ? String(credBody.value ?? credBody.apiKey).trim()
              : "";
          if (!value.trim())
            return json(res, 400, { error: "credential value is required" });
          try {
            await providerManager.setCredential(pid, {
              providerId: pid,
              credentialType:
                entry.credentialType as ProviderCredential["credentialType"],
              value,
              createdAt: new Date().toISOString(),
            });
            // Return ONLY a status confirmation â€” never the credential.
            return json(res, 200, {
              providerId: pid,
              credentialSource: "local-secret-store",
              stored: true,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // DELETE /api/providers/:id/credential â€” remove a stored credential
        const providerCredDel = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/credential$/,
        );
        if (req.method === "DELETE" && providerCredDel) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerCredDel[1]);
          try {
            await providerManager.setCredential(pid);
            const refreshed = await providerManager.getProviderStatus(pid);
            return json(res, 200, {
              providerId: pid,
              configured: refreshed.configured,
              credentialSource: refreshed.credentialSource,
              deleted: true,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("Unknown provider") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // POST /api/providers/runtime-config â€” update non-secret runtime config
        if (
          req.method === "POST" &&
          url.pathname === "/api/providers/runtime-config"
        ) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const rcBody = await body(req);
          try {
            if (
              typeof rcBody.activeProvider === "string" &&
              rcBody.activeProvider !== "<default>"
            ) {
              const target = await providerManager.get(rcBody.activeProvider);
              if (!target?.configured || !target.enabled)
                return json(res, 400, {
                  error:
                    "Provider requires an enabled configuration and credential",
                });
            }
            const updated = providerManager.saveRuntimeConfigPatch({
              activeProvider:
                typeof rcBody.activeProvider === "string"
                  ? rcBody.activeProvider
                  : undefined,
              providers:
                rcBody.providers && typeof rcBody.providers === "object"
                  ? (rcBody.providers as Record<
                      string,
                      Partial<ProviderRuntimeSettings>
                    >)
                  : undefined,
            });
            return json(res, 200, { runtime: updated });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // PUT /api/providers/:id â€” update non-secret runtime settings (model, apiBase)
        const providerUpdate = url.pathname.match(
          /^\/api\/providers\/([^/]+)$/,
        );
        if (req.method === "PUT" && providerUpdate) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerUpdate[1]);
          const input = await body(req);
          try {
            const summary = await providerManager.update(pid, {
              model: typeof input.model === "string" ? input.model : undefined,
              apiBase:
                typeof input.apiBase === "string" ? input.apiBase : undefined,
              temperature:
                typeof input.temperature === "number"
                  ? input.temperature
                  : undefined,
            });
            return json(res, 200, summary);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // POST /api/providers/:id/test â€” test connection (transient credential,
        // never persisted or logged)
        const providerTest = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/test$/,
        );
        if (req.method === "POST" && providerTest) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerTest[1]);
          const testBody = await body(req);
          const transient =
            typeof testBody.value === "string" ||
            typeof testBody.apiKey === "string"
              ? {
                  providerId: pid,
                  credentialType: "api_key" as const,
                  value: String(testBody.value ?? testBody.apiKey ?? ""),
                  createdAt: new Date().toISOString(),
                }
              : undefined;
          try {
            const result = await providerManager.test(pid, transient, {
              ...(typeof testBody.model === "string"
                ? { model: testBody.model }
                : {}),
              ...(typeof testBody.temperature === "number"
                ? { temperature: testBody.temperature }
                : {}),
            });
            return json(res, 200, result);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // POST /api/providers/:id/activate â€” set the active provider for upcoming runs
        const providerActivate = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/activate$/,
        );
        if (req.method === "POST" && providerActivate) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerActivate[1]);
          try {
            await providerManager.activate(pid);
            const provider = await providerManager.get(pid);
            return json(res, 200, { activeProvider: pid, provider });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        if (req.method === "GET" && url.pathname === "/api/workspace-context") {
          return json(res, 200, {
            root: workspaceRoot,
            source: process.env.ONESHOT_WORKSPACE_ROOT
              ? "configured"
              : "application-default",
          });
        }

        if (req.method === "GET" && url.pathname === "/api/runs") {
          return json(res, 200, {
            runs: runs.list().map((run) => ({
              run_id: run.run_id,
              pipeline_status: run.pipeline_status,
              test_result: run.test_result,
              current_processor: run.current_processor,
              hash_proof: run.hash_proof,
              updated_at: run.events.at(-1)?.created_at,
            })),
          });
        }

        const buildReviewMatch = url.pathname.match(
          /^\/api\/runs\/([A-Za-z0-9:_-]+)\/build-review$/,
        );
        if (
          buildReviewMatch &&
          (req.method === "GET" || req.method === "POST")
        ) {
          const runId = buildReviewMatch[1];
          const snapshot = runs.get(runId);
          if (!snapshot) return json(res, 404, { error: "run not found" });
          try {
            if (req.method === "GET") {
              const gate = await runtime.buildReview.get(runId);
              return gate
                ? json(res, 200, gate)
                : json(res, 404, { error: "Build is not ready" });
            }
            if (snapshot.pipeline_status === "Done")
              return json(res, 409, { error: "Run has already finished" });
            const input = await body(req);
            const gate = await runtime.buildReview.decide(runId, input);
            const mode = await runtime?.store?.load?.<{ mode: string }>(
              runId,
              "execution-mode",
            );
            if (input.action === "approve" && mode?.mode === "pipeline") {
              if (!options.pipeline?.queueReady)
                return json(res, 503, {
                  error:
                    "Build authorized; queue unavailable. Retry confirmation when the queue recovers.",
                });
              await options.pipeline.enqueue(runId, "build");
              events.emit(runId, "BuildReady", "Completed", {
                scope: "SUPPORT",
                message: "Build authorized for the confirmed package.",
              });
            }
            if (input.action === "return")
              events.emit(runId, "BuildReady", "Running", {
                scope: "SUPPORT",
                message:
                  "Returned to confirmed summary; build remains waiting for authorization.",
              });
            return json(res, 200, gate);
          } catch (error) {
            if (error instanceof BuildReviewError)
              return json(res, error.status, { error: error.message });
            return json(res, 503, {
              error: "Build continuation unavailable; retry confirmation.",
            });
          }
        }

        // GET /api/runs/:id â€” run snapshot
        const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
        if (req.method === "GET" && runMatch) {
          const r = runs.get(runMatch[1]);
          return r
            ? json(res, 200, r)
            : json(res, 404, { error: "run not found" });
        }

        // GET /api/runs/:id/task â€” task projection
        const taskMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/task$/);
        if (req.method === "GET" && taskMatch) {
          const r = runs.get(taskMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            task
              ? task.projection(taskMatch[1], r)
              : { run_id: taskMatch[1], events: events.list(taskMatch[1]) },
          );
        }

        // GET /api/runs/:id/audit â€” audit projection
        const auditMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/audit$/);
        if (req.method === "GET" && auditMatch) {
          const r = runs.get(auditMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            task
              ? task.audit(auditMatch[1], r)
              : { run_id: auditMatch[1], events: events.list(auditMatch[1]) },
          );
        }

        // GET /api/runs/:id/strands-graph — Strands graph for a specific run
        // (/adk-graph kept as a compatibility alias for existing clients)
        const graphMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/(?:strands-graph|adk-graph)$/,
        );
        if (req.method === "GET" && graphMatch) {
          const r = runs.get(graphMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(res, 200, projectStrandsGraph(events.list(graphMatch[1])));
        }

        // GET /api/runs/:id/authority-graph â€” authority graph for a specific run
        const authorityMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/authority-graph$/,
        );
        if (req.method === "GET" && authorityMatch) {
          const r = runs.get(authorityMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            projectAuthorityGraph(events.list(authorityMatch[1])),
          );
        }

        const reviewMatch = url.pathname.match(
          /^\/api\/runs\/([A-Za-z0-9:_-]+)\/review$/,
        );
        if (reviewMatch && (req.method === "GET" || req.method === "POST")) {
          const runId = reviewMatch[1];
          const snapshot = runs.get(runId);
          if (!snapshot) return json(res, 404, { error: "run not found" });
          try {
            if (req.method === "GET") {
              const review = await runtime.review.get(runId);
              return review
                ? json(res, 200, review)
                : json(res, 404, { error: "No plan review available" });
            }
            if (snapshot.pipeline_status === "Done")
              return json(res, 409, { error: "Run has already finished" });
            return json(
              res,
              200,
              await runtime.review.decide(runId, await body(req)),
            );
          } catch (error) {
            if (error instanceof PlanReviewError)
              return json(res, error.status, { error: error.message });
            throw error;
          }
        }

        // GET /api/runs/:id/artifacts/:name â€” fetch specific artifact content
        const artifactMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/artifacts\/([^/]+)$/,
        );
        if (req.method === "GET" && artifactMatch) {
          const runId = artifactMatch[1];
          const artifactName = artifactMatch[2];
          try {
            const data = await runtime.store.load<any>(runId, artifactName);
            return json(res, 200, data);
          } catch (e) {
            return json(res, 404, {
              error: `Artifact '${artifactName}' not found for run ${runId}`,
            });
          }
        }

        // POST /api/runs/:id/sandbox/execute â€” execute sandbox handoff
        const sbxExecMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox\/execute$/,
        );
        if (req.method === "POST" && sbxExecMatch) {
          if (!sandbox)
            return json(res, 503, { error: "sandbox service unavailable" });
          const runId = sbxExecMatch[1];
          const r = runs.get(runId);
          if (!r) return json(res, 404, { error: "run not found" });
          if (r.test_result !== "Passed" || !r.hash_proof?.equal) {
            return json(res, 409, {
              error:
                "Run has not reached confirmed DONE status with valid canonical hash",
              run_result: r.test_result,
            });
          }

          const inputData = await body(req);
          try {
            const confirmedPackage = await runtime.store.load<any>(
              runId,
              "confirmed",
            );
            const hash = r.hash_proof.created_hash;

            const sbxInput: SandboxExecutionInput = {
              confirmed_package: confirmedPackage,
              hash,
              execution_authorization: inputData.execution_authorization as any,
            };

            const result = await sandbox.execute(sbxInput);
            return json(res, result.result === "Passed" ? 200 : 409, result);
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // GET /api/runs/:id/sandbox â€” get recorded sandbox evidence
        const sbxGetMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox$/,
        );
        if (req.method === "GET" && sbxGetMatch) {
          if (!sandbox)
            return json(res, 503, { error: "sandbox service unavailable" });
          const evidence = sandbox.getEvidence(sbxGetMatch[1]);
          return evidence
            ? json(res, 200, evidence)
            : json(res, 404, {
                error: "sandbox evidence not found for run",
              });
        }

        // GET /api/runs/:id/sandbox-graph â€” sandbox lifecycle graph for run
        const sbxGraphMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox-graph$/,
        );
        if (req.method === "GET" && sbxGraphMatch) {
          const r = runs.get(sbxGraphMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            projectSandboxGraph(events.list(sbxGraphMatch[1])),
          );
        }

        // GET /api/runs/:id/events â€” SSE event stream
        const eventMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
        if (req.method === "GET" && eventMatch) {
          const runId = eventMatch[1];
          const snapshot = runs.get(runId);
          if (!snapshot) return json(res, 404, { error: "run not found" });

          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-content-type-options": "nosniff",
          });

          // SSE wire format: `id: <sequence>` + `event: processing` + `data:{...}`.
          // The id lets a reconnecting client send Last-Event-ID so we replay only
          // events after that sequence (no duplicate replay). The frontend keys
          // on event_id so it tolerates repeated events regardless.
          const sendEvent = (e: { sequence: number }) => {
            res.write(`id: ${e.sequence}\n`);
            res.write(`event: processing\n`);
            res.write(`data: ${JSON.stringify(e)}\n\n`);
          };

          const lastHeader = req.headers["last-event-id"];
          const lastSeq =
            typeof lastHeader === "string" ? Number(lastHeader) : NaN;
          const replayFrom = Number.isFinite(lastSeq) ? lastSeq : -1;
          for (const e of snapshot.events) {
            if (e.sequence > replayFrom) sendEvent(e);
          }

          // Subscribe to live canonical events. Closing the browser only
          // unsubscribes here â€” it NEVER cancels the BullMQ job/run.
          const unsub = events.subscribe(runId, sendEvent);
          const heartbeat = setInterval(() => {
            try {
              res.write(`: keep-alive\n\n`);
            } catch {
              /* connection already closed */
            }
          }, 15_000);
          req.on("close", () => {
            unsub();
            clearInterval(heartbeat);
          });
          return;
        }

        // ---------------------------------------------------------------
        // Target Workspace endpoints (§11–12)
        // ---------------------------------------------------------------

        // GET /api/workspace — current explicit target workspace info
        if (req.method === "GET" && url.pathname === "/api/workspace") {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          const info = await options.targetWorkspace.current();
          return info
            ? json(res, 200, info)
            : json(res, 404, { error: "no target workspace selected" });
        }

        // GET /api/workspace/uploads — list uploaded archive files
        if (req.method === "GET" && url.pathname === "/api/workspace/uploads") {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          try {
            const uploadsRoot = resolve(process.cwd(), ".runtime", "uploads");
            const entries = await readdir(uploadsRoot, { withFileTypes: true });
            const files = entries
              .filter((e) => e.isFile())
              .map((e) => e.name)
              .filter((n) => !n.startsWith("."));
            return json(res, 200, { uploads: files });
          } catch (error: any) {
            if (error.code === "ENOENT") return json(res, 200, { uploads: [] });
            return json(res, 500, { error: String(error) });
          }
        }

        // POST /api/workspace/materialize — materialize an uploaded archive
        if (
          req.method === "POST" &&
          url.pathname === "/api/workspace/materialize"
        ) {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          try {
            const input = await body(req);
            const uploadName = String(input.upload_name || "");
            const info =
              await options.targetWorkspace.materializeUpload(uploadName);
            return json(res, 200, info);
          } catch (e) {
            const status = e instanceof TargetWorkspaceError ? e.status : 500;
            return json(res, status, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/workspace/select-existing — select an existing directory
        if (
          req.method === "POST" &&
          url.pathname === "/api/workspace/select-existing"
        ) {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          try {
            const input = await body(req);
            const source =
              input.source === "project-root-fallback"
                ? "project-root-fallback"
                : "workspace-root";
            const root = String(input.root || "");
            if (!root)
              return json(res, 400, { error: "root path is required" });
            const info = await options.targetWorkspace.selectExisting(
              source,
              root,
            );
            return json(res, 200, info);
          } catch (e) {
            const status = e instanceof TargetWorkspaceError ? e.status : 500;
            return json(res, status, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/workspace/auto-select — auto-select based on ONESHOT_WORKSPACE_ROOT
        if (
          req.method === "POST" &&
          url.pathname === "/api/workspace/auto-select"
        ) {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          try {
            const envRoot = process.env.ONESHOT_WORKSPACE_ROOT;
            const root = envRoot ? resolve(envRoot) : process.cwd();
            const source = envRoot ? "workspace-root" : "project-root-fallback";
            const info = await options.targetWorkspace.selectExisting(
              source,
              root,
            );
            return json(res, 200, info);
          } catch (e) {
            const status = e instanceof TargetWorkspaceError ? e.status : 500;
            return json(res, status, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/workspace/upload — receive an archive upload (raw bytes)
        if (req.method === "POST" && url.pathname === "/api/workspace/upload") {
          if (!options.targetWorkspace)
            return json(res, 503, {
              error: "target workspace service unavailable",
            });
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) chunks.push(chunk as Buffer);
            if (chunks.length === 0)
              return json(res, 400, { error: "empty upload" });
            const buf = Buffer.concat(chunks);
            // Content-Disposition filename, else timestamped fallback
            const disp = req.headers["content-disposition"] || "";
            const fnMatch = /filename="?([^"]+)"?/i.exec(disp);
            const fileName = fnMatch?.[1] || `upload-${Date.now()}.tar.gz`;
            const clean = basename(fileName);
            if (!clean.startsWith(".")) {
              const uploadsRoot = resolve(process.cwd(), ".runtime", "uploads");
              await mkdir(uploadsRoot, { recursive: true });
              await writeFile(resolve(uploadsRoot, clean), buf);
              return json(res, 200, { stored: clean, bytes: buf.length });
            }
            return json(res, 400, { error: "invalid upload name" });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // ---------------------------------------------------------------
        // Static UI files
        // ---------------------------------------------------------------
        if (req.method === "GET") {
          if (
            url.pathname.startsWith("/api/") ||
            url.pathname.startsWith("/v1/")
          ) {
            return json(res, 404, {
              error: `Endpoint not found: ${url.pathname}`,
            });
          }
          const requested =
            url.pathname === "/" ? "index.html" : url.pathname.slice(1);
          const safe = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
          const firstSegment = safe.split(/[\\/]/)[0] ?? "";
          if (firstSegment.startsWith(".") || isSensitiveWorkspacePath(safe)) {
            // Deny HTTP reads of .env / .env.* / .git / .runtime / credential
            // and secret files. Never reveal whether the path exists.
            return json(res, 404, { error: "not found" });
          }
          const p = join(uiRoot, safe);
          try {
            const data = await readFile(p);
            res.writeHead(200, {
              "content-type": mime(p),
              "cache-control": "no-store",
            });
            return res.end(data);
          } catch {
            const acceptsHtml = (req.headers.accept || "").includes(
              "text/html",
            );
            if (
              url.pathname !== "/" &&
              acceptsHtml &&
              !url.pathname.startsWith("/api/") &&
              !url.pathname.startsWith("/v1/")
            ) {
              try {
                const index = await readFile(join(uiRoot, "index.html"));
                res.writeHead(200, {
                  "content-type": "text/html; charset=utf-8",
                  "cache-control": "no-store",
                });
                return res.end(index);
              } catch {
                /* fall through to 404 */
              }
            }
          }
        }

        json(res, 404, { error: "not found" });
      } catch (e) {
        json(res, 500, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  return new Promise<ReturnType<typeof createServer>>((resolveServer) =>
    server.listen(port, bindHost, () => resolveServer(server)),
  );
}

async function checkWorkerHealth(
  queueAvailable: boolean,
): Promise<"ok" | "degraded" | "disabled"> {
  if (!queueAvailable) {
    return "disabled";
  }

  try {
    const redis = getProducerRedis();
    if (redis.status !== "ready") return "degraded";
    let cursor = "0";
    // Bound the health probe's work even in a large shared Redis database.
    for (let page = 0; page < 10; page++) {
      const [next, keys] = await redis.scan(
        cursor,
        "MATCH",
        "oneshot:worker:*:heartbeat",
        "COUNT",
        100,
      );
      if (keys.length > 0) return "ok";
      cursor = next;
      if (cursor === "0") break;
    }
    return "degraded";
  } catch {
    return "degraded";
  }
}
