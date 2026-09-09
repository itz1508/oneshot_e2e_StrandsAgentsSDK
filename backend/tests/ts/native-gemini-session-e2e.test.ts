import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import type {
  Plan,
  ProcessingEvent,
  Prompt,
  ResearchBundle,
} from "../../contracts/schema/types.js";
import type { ExecutionAuthorization } from "../../sandbox/types.js";
import type {
  RunnerExecutionResult,
  SandboxRunner,
} from "../../sandbox/runner/runner.js";
import { HardenedProcessRunner } from "../../sandbox/runner/process-runner.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../../../app/web/cloud/provider.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";
import { resolveResearchProvider } from "../../../app/web/cloud/provider-resolver.js";
import { ConversationStore } from "../../intent/conversation-store.js";
import { IntentCollectionService } from "../../intent/intent-collection.js";
import { PromptGenerator } from "../../intent/prompt-generator.js";
import { startHttpServer } from "../../server/http-server.js";
import { harness } from "./harness.js";

function print(label: string, value: unknown): void {
  console.log(`${label}=${JSON.stringify(value)}`);
}

class CapturingResearchProvider implements ResearchProvider {
  receivedPrompt?: Prompt;

  constructor(private inner: ResearchProvider) {}

  ready(runId: string): Promise<ResearchProviderReadiness> {
    return this.inner.ready(runId);
  }

  attachEvents(events: ProcessingEventBus): void {
    this.inner.attachEvents?.(events);
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    this.receivedPrompt = structuredClone(prompt);
    return await this.inner.research(prompt, runId);
  }

  close(): void {
    this.inner.close?.();
  }
}

class CapturingHardenedRunner implements SandboxRunner {
  readonly inner = new HardenedProcessRunner();
  last?: RunnerExecutionResult;

  async execute(
    sandboxId: string,
    workspacePath: string,
    plan: Plan,
    auth: ExecutionAuthorization,
    onLog?: (stream: "stdout" | "stderr", chunk: string) => void,
  ): Promise<RunnerExecutionResult> {
    this.last = await this.inner.execute(
      sandboxId,
      workspacePath,
      plan,
      auth,
      onLog,
    );
    return this.last;
  }

  async cleanup(sandboxId: string, workspacePath: string): Promise<boolean> {
    return await this.inner.cleanup(sandboxId, workspacePath);
  }
}

async function waitForTerminal(
  base: string,
  runId: string,
  timeoutMs = 20 * 60_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const response = await fetch(`${base}/api/runs/${runId}`);
    assert.equal(response.status, 200);
    const snapshot = await response.json();
    if (snapshot.test_result) return snapshot;
    if (Date.now() >= deadline) {
      throw new Error(`live run ${runId} did not terminate within ${timeoutMs}ms`);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 1000));
  }
}

test(
  "live native Strands Gemini session runs from conversation start through Builder and final hash response",
  {
    timeout: 25 * 60_000,
    skip:
      process.env.ONESHOT_LIVE_GEMINI_E2E === "true"
        ? false
        : "set ONESHOT_LIVE_GEMINI_E2E=true with Google credentials to run live native Gemini inference",
  },
  async () => {
    const requiredModels = [
      process.env.GEMINI_DISTRIBUTION_MODEL || "",
      process.env.GEMINI_RESEARCH_MODEL || "",
      process.env.GEMINI_SYNTHESIS_MODEL || "",
    ];
    assert.ok(requiredModels.every(Boolean), "three live Gemini model bindings are required");
    assert.equal(new Set(requiredModels).size, 3, "live Gemini bindings must be distinct");

    const savedMode = process.env.ONESHOT_MODE;
    const savedProvider = process.env.ONESHOT_RESEARCH_PROVIDER;
    process.env.ONESHOT_MODE = "production";
    process.env.ONESHOT_RESEARCH_PROVIDER = "gemini";

    const innerProvider = await resolveResearchProvider(process.cwd());
    const provider = new CapturingResearchProvider(innerProvider);
    const readiness = await provider.ready("native-gemini-live-proof-readiness");
    print("LIVE_PROVIDER_READINESS_JSON", readiness);
    assert.equal(readiness.ready, true, readiness.detail);
    assert.deepEqual(readiness.models, requiredModels);

    const runner = new CapturingHardenedRunner();
    const h = await harness("native-gemini-live-e2e", provider, runner);
    const observed: ProcessingEvent[] = [];
    const stopObserve = h.events.observe((event) => {
      observed.push(event);
      if (event.scope === "SUPPORT" || event.execution_status === "Completed" || event.processor === "Builder") {
        print("LIVE_WORKFLOW_EVENT_JSON", event);
      }
    });
    const intent = new IntentCollectionService(new ConversationStore());
    const server = await startHttpServer(
      h.runtime,
      h.runs,
      h.events,
      resolve("ui"),
      0,
      h.task,
      intent,
    );

    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const base = `http://127.0.0.1:${address.port}`;

      const userMessage = [
        "Build a disposable CommonJS Node media-support utility inside the OneShot sandbox.",
        "The implementation must create media.js exporting supports(name), returning true only for .mp4 and .mp3 filenames case-insensitively.",
        "Create verify.js that checks MP4=true, MP3=true, WAV=false and prints exactly PRODUCT_VERIFY mp4=true mp3=true wav=false.",
        "The implementation plan must be executable by the sandbox: every plan step description must be a direct shell command beginning with node.",
        "Before creating files, include a node command that verifies media.js and verify.js do not exist and prints exactly BEFORE_VERIFY target_files_absent=true.",
        "The final step must run node verify.js.",
        "Do not use npm, network access, Markdown code fences, placeholders, or explanatory prose in plan step descriptions.",
        "Produce deterministic validation evidence and a final hash proof.",
      ].join(" ");
      print("LIVE_SESSION_INPUT_JSON", { user_message: userMessage });

      const conversationResponse = await fetch(`${base}/api/conversations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      assert.equal(conversationResponse.status, 201);
      const conversation = (await conversationResponse.json()) as any;
      print("LIVE_CONVERSATION_JSON", conversation);
      assert.equal(conversation.intent.ready_for_prompt, true);

      const promptResponse = await fetch(
        `${base}/api/conversations/${encodeURIComponent(conversation.conversation_id)}/prompt`,
        { method: "POST" },
      );
      assert.equal(promptResponse.status, 200);
      const httpPrompt = await promptResponse.json();
      print("HTTP_PROMPT_RESPONSE_JSON", httpPrompt);

      const runResponse = await fetch(
        `${base}/api/conversations/${encodeURIComponent(conversation.conversation_id)}/run`,
        { method: "POST" },
      );
      assert.equal(runResponse.status, 202);
      const started = (await runResponse.json()) as {
        run_id: string;
        prompt_id: string;
      };
      print("LIVE_RUN_CREATED_JSON", started);

      const snapshot = await waitForTerminal(base, started.run_id);
      assert.ok(provider.receivedPrompt, "Researcher did not receive Prompt(id)");
      print("RESEARCHER_RECEIVED_PROMPT_JSON", provider.receivedPrompt);
      const expectedRunPrompt = new PromptGenerator().generate(
        conversation.intent,
        started.prompt_id,
      );
      assert.deepEqual(provider.receivedPrompt, expectedRunPrompt);

      const runEvents = observed.filter((event) => event.run_id === started.run_id);
      const persistedEvents = h.events.list(started.run_id);
      assert.equal(runEvents.length, persistedEvents.length);
      for (const event of persistedEvents) {
        print("LIVE_SESSION_EVENT_JSON", event);
      }

      const stageProcessors = [
        "Strands:distribution-model",
        "Strands:research-model",
        "Strands:synthesis-model",
      ];
      const stageResponses = stageProcessors.map((processor) => {
        const event = persistedEvents.find(
          (candidate) => candidate.processor === processor && candidate.execution_status === "Completed",
        );
        assert.ok(event, `missing live ${processor} COMPLETE event`);
        assert.match(event.message || "", /response=/, `${processor} did not expose response evidence`);
        return { processor, message: event.message };
      });
      print("LIVE_THREE_MODEL_RESPONSES_JSON", stageResponses);

      const researchPlan = await h.store.load<any>(started.run_id, "plan.researcher");
      assert.ok(researchPlan);
      print("LIVE_MODEL_PLAN_JSON", researchPlan);
      assert.ok(researchPlan.steps.length >= 3);
      for (const step of researchPlan.steps) {
        assert.match(step.description, /^node\b/i, `non-executable model plan step: ${step.description}`);
      }

      print("LIVE_FINAL_RUN_JSON", {
        run_id: snapshot.run_id,
        result: snapshot.test_result,
        current_processor: snapshot.current_processor,
        hash_proof: snapshot.hash_proof,
      });
      assert.equal(snapshot.test_result, "Passed");
      assert.equal(snapshot.hash_proof?.equal, true);

      assert.ok(runner.last, "real HardenedProcessRunner did not execute");
      const execution = runner.last;
      print("LIVE_BUILDER_EXECUTION_JSON", {
        commands: execution.commands,
        exit_codes: execution.exit_codes,
        stdout_lines: execution.stdout_lines,
        stderr_lines: execution.stderr_lines,
        file_changes: execution.file_changes,
        bytes_written: execution.bytes_written,
        condition: execution.condition,
      });

      const stdout = execution.stdout_lines.join("\n");
      assert.match(stdout, /BEFORE_VERIFY target_files_absent=true/);
      assert.match(stdout, /PRODUCT_VERIFY mp4=true mp3=true wav=false/);
      assert.ok(execution.file_changes.some((change) => change.path === "/work/media.js"));
      assert.ok(execution.file_changes.some((change) => change.path === "/work/verify.js"));
      assert.ok(execution.bytes_written > 0, "Builder wrote zero bytes");
      assert.ok(execution.exit_codes.every((code) => code === 0));
      assert.equal(execution.condition, "success");

      const builderResult = await h.store.load<any>(started.run_id, "builder-result");
      print("LIVE_BUILDER_RESULT_JSON", builderResult);
      assert.equal(builderResult.result, "Passed");
      assert.equal(builderResult.hash_matched, true);

      print("LIVE_END_TO_END_PROOF_JSON", {
        conversation_id: conversation.conversation_id,
        session_id: conversation.session_id,
        run_id: started.run_id,
        models: requiredModels,
        model_response_events: stageResponses.length,
        workflow_event_count: persistedEvents.length,
        before_verified: true,
        created_files: execution.file_changes.map((change) => change.path),
        bytes_written: execution.bytes_written,
        product_verification: "PRODUCT_VERIFY mp4=true mp3=true wav=false",
        hash_equal: snapshot.hash_proof.equal,
        final_result: snapshot.test_result,
      });
    } finally {
      stopObserve();
      server.closeAllConnections();
      await new Promise<void>((ok, fail) =>
        server.close((error) => (error ? fail(error) : ok())),
      );
      h.close();
      if (savedMode === undefined) delete process.env.ONESHOT_MODE;
      else process.env.ONESHOT_MODE = savedMode;
      if (savedProvider === undefined) delete process.env.ONESHOT_RESEARCH_PROVIDER;
      else process.env.ONESHOT_RESEARCH_PROVIDER = savedProvider;
    }
  },
);
