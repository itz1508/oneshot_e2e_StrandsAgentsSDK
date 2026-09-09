import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProviderManager } from "../../../app/web/cloud/provider-manager.js";
import { LocalFileSecretStore } from "../../../app/web/cloud/provider-secret-store.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { FixtureResearchProvider } from "../../../app/web/cloud/provider/fixture-provider.js";
import { executeRunJob, type RunJobLike } from "../../runtime/queue.js";
import type {
  Prompt,
  RunSnapshot,
} from "../../contracts/schema/types.js";
import type { WorkflowRuntime } from "../../runtime/workflow-runtime.js";
import type { RunQueueDeps } from "../../runtime/queue.js";
import { createServer } from "node:http";
import { FileProviderRuntimeConfigStore } from "../../../app/web/cloud/provider-runtime-config.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "oneshot-pinfra-"));
}

function makePrompt(runId: string): Prompt {
  return {
    prompt_id: `prompt:${runId}`,
    intent: "Run canonical sample",
    requested_outcome: "Reach DONE",
    context: [{ context_id: `ctx:${runId}`, statement: "E2E" }],
    research_direction: ["contracts"],
  };
}

function makeManager(dir: string): ProviderManager {
  return new ProviderManager({
    projectRoot: process.cwd(),
    mode: "sample",
    runtimePaths: {
      root: dir,
      config: join(dir, "config"),
    } as never,
    secretStore: new LocalFileSecretStore(join(dir, "secrets")),
  });
}

function makeDeps(
  dir: string,
  runtime: WorkflowRuntime,
  resolveProvider: RunQueueDeps["resolveProvider"],
  runs: RunRepository,
  events: ProcessingEventBus,
): RunQueueDeps {
  return {
    runs,
    events,
    projectRoot: dir,
    resolveProvider,
    createRuntime: async () => runtime,
  };
}

const FAKE_SECRET = "sk-test-1234567890abcdef";

for (const [id, name] of [["openai", "OpenAI"], ["anthropic", "Anthropic"], ["gemini", "Gemini"]]) {
  test(`native ${name} BYOK: real transport, transient test, saved/replaced key, pinned settings, safe failure`, async () => {
    const dir = tempDir();
    const envName = id.toUpperCase() + "_API_KEY";
    const previous = process.env[envName];
    const google = process.env.GOOGLE_API_KEY;
    delete process.env[envName];
    delete process.env.GOOGLE_API_KEY;
    const observed: { model: string; key: string; path: string }[] = [];
    const fixture = readFileSync("app/fixtures/provider/research-draft.json", "utf8");
    let reject = false;
    const remote = createServer(async (req, res) => {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const data = JSON.parse(raw);
      const key = String(req.headers.authorization || req.headers["x-api-key"] || req.headers["x-goog-api-key"]);
      observed.push({ model: data.model || decodeURIComponent(req.url!.split("/models/")[1].split(":")[0]), key, path: req.url! });
      res.setHeader("content-type", "application/json");
      if (reject) { res.writeHead(401); res.end(JSON.stringify({ error: FAKE_SECRET })); return; }
      res.end(JSON.stringify(id === "openai" ? { choices: [{ message: { content: fixture } }] } :
        id === "anthropic" ? { content: [{ type: "text", text: fixture }] } :
        { candidates: [{ content: { parts: [{ text: fixture }] } }] }));
    });
    await new Promise<void>(ok => remote.listen(0, "127.0.0.1", ok));
    const address = remote.address() as { port: number };
    const events = new ProcessingEventBus();
    const secrets = new LocalFileSecretStore(join(dir, "secrets"));
    const pm = new ProviderManager({ projectRoot: process.cwd(), mode: "production", events,
      secretStore: secrets, runtimeConfigStore: new FileProviderRuntimeConfigStore(join(dir, "providers.json")) });
    let provider;
    try {
      assert.equal(pm.runtimeConfig().activeProvider, "<default>");
      assert.deepEqual((await pm.list()).map(p => p.id).sort(), ["anthropic", "gemini", "openai"]);
      assert.equal((await pm.get(id))!.configured, false);
      await assert.rejects(pm.activate(id), /credential/);
      await pm.update(id, { model: "captured-model", apiBase: `http://127.0.0.1:${address.port}/v1` });
      assert.equal((await pm.test(id)).ok, false);
      const credential = { providerId: id, credentialType: "api_key" as const, value: FAKE_SECRET, createdAt: new Date().toISOString() };
      assert.equal((await pm.test(id, credential)).ok, true);
      assert.equal(await secrets.has(id), false, "transient test must not save key");
      await pm.setCredential(id, credential);
      await pm.activate(id);
      const captured = pm.captureForRun();
      const revision = captured.configRevision;
      await pm.update(id, { model: "later-model" });
      pm.saveRuntimeConfigPatch({ activeProvider: "<default>" });
      await pm.setCredential(id, { ...credential, value: "replacement-test-key" });
      provider = await pm.resolveForRun(captured.id, captured);
      assert.equal((await provider.ready("pinned")).ready, true);
      const bundle = await provider.research(makePrompt("pinned"), "pinned");
      assert.ok(bundle.plan.steps.length);
      assert.equal(observed.at(-1)!.model, "captured-model");
      assert.ok(observed.at(-1)!.key.includes("replacement-test-key"));
      assert.equal(captured.configRevision, revision);
      assert.equal(captured.settings.model, "captured-model");
      assert.ok(!JSON.stringify(captured).includes(FAKE_SECRET));
      reject = true;
      const failure = await pm.test(id);
      assert.equal(failure.ok, false);
      assert.ok(!JSON.stringify(failure).includes(FAKE_SECRET));
      assert.ok(!JSON.stringify(events.list("pinned")).includes(FAKE_SECRET));
      assert.ok(!JSON.stringify(await pm.list()).includes("replacement-test-key"));
      await pm.activate(id);
      await pm.setCredential(id);
      assert.equal(pm.runtimeConfig().activeProvider, "<default>");
      assert.equal((await pm.get(id))!.configured, false);
      const clone = pm.runtimeConfig();
      clone.activeProvider = "featherless";
      assert.equal(pm.runtimeConfig().activeProvider, "<default>");
    } finally {
      provider?.close?.();
      remote.closeAllConnections();
      await new Promise<void>(ok => remote.close(() => ok()));
      if (previous === undefined) delete process.env[envName]; else process.env[envName] = previous;
      if (google === undefined) delete process.env.GOOGLE_API_KEY; else process.env.GOOGLE_API_KEY = google;
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

/** Wrap a real runtime so we never re-implement canonical wiring in tests. */
function fakeRuntime(runs: RunRepository): WorkflowRuntime {
  return {
    run: async (runId: string, _prompt: Prompt): Promise<RunSnapshot> => {
      runs.finish(runId, "Passed");
      return runs.require(runId);
    },
  } as unknown as WorkflowRuntime;
}

test("secret store is write-only from the browser's perspective", async () => {
  const dir = tempDir();
  try {
    const store = new LocalFileSecretStore(join(dir, "secrets"));
    await store.set("featherless", {
      providerId: "featherless",
      credentialType: "api_key",
      value: FAKE_SECRET,
      createdAt: new Date().toISOString(),
    });
    assert.equal(await store.has("featherless"), true);
    assert.equal((await store.get("featherless"))?.value, FAKE_SECRET);

    // Credential files live outside the workspace and are never web-served.
    assert.ok(!dir.startsWith(resolve(process.cwd())));

    await store.delete("featherless");
    assert.equal(await store.has("featherless"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provider manager never discloses credential values in catalog or status", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    await pm.setCredential("openai", {
      providerId: "openai",
      credentialType: "api_key",
      value: FAKE_SECRET,
      createdAt: new Date().toISOString(),
    });

    const status = await pm.getProviderStatus("openai");
    assert.equal(status.configured, true);
    assert.equal(status.credentialSource, "local-secret-store");
    assert.ok(!JSON.stringify(status).includes(FAKE_SECRET));

    const statuses = await pm.listProviderStatus();
    assert.ok(!JSON.stringify(statuses).includes(FAKE_SECRET));
    for (const id of ["sample", "openai", "anthropic", "gemini"]) {
      assert.ok(statuses.some((s) => s.id === id), `catalog has ${id}`);
    }

    // Catalog is git-tracked and non-secret.
    const catalogPath = resolve(process.cwd(), "app/web/cloud/providers.json");
    const catalogRaw = readFileSync(catalogPath, "utf8");
    assert.ok(!catalogRaw.includes(FAKE_SECRET));
    assert.ok(catalogRaw.includes("openai"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("runtime config store rejects secret-shaped fields", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    assert.throws(
      () =>
        pm.saveRuntimeConfigPatch({
          providers: {
            openai: {
              apiKey: FAKE_SECRET,
            } as never,
          },
        }),
      /forbidden/i,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown provider id is rejected on save and status", async () => {
  const dir = tempDir();
  try {
    const pm = makeManager(dir);
    assert.throws(
      () => pm.saveRuntimeConfigPatch({ activeProvider: "unknown" }),
      /Unknown provider/,
    );
    await assert.rejects(
      () => pm.getProviderStatus("unknown"),
      /Unknown provider/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker executes the canonical workflow with per-run provider binding", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    let resolvedAt = 0;
    const deps = makeDeps(
      dir,
      runtime,
      async () => {
        resolvedAt++;
        return provider;
      },
      runs,
      events,
    );

    const runId = "test-run-1";
    runs.create(runId);
    const progressCalls: Array<number | object> = [];
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async (p) => {
        progressCalls.push(p);
      },
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "completed");
    assert.equal(resolvedAt, 1);
    assert.equal(runs.require(runId).test_result, "Passed");

    // Progress carries only non-secret metadata.
    assert.ok(
      !JSON.stringify(progressCalls).includes(FAKE_SECRET),
      "progress must never contain secrets",
    );
    // Progress now carries canonical events (spec §5: {kind:"processing-event", event}).
    // Order: ProviderBinding/COMPLETE (readiness proven before Researcher) →
    // RunWorker/RUNNING → RunWorker/COMPLETE.
    assert.deepEqual(
      progressCalls.map((p) => (p as { kind: string }).kind),
      ["processing-event", "processing-event", "processing-event"],
    );
    assert.deepEqual(
      progressCalls.map(
        (p) => (p as { event: { execution_status: string } }).event.execution_status,
      ),
      ["Completed", "Running", "Completed"],
    );

    // Bus events include RUNNING and COMPLETE for the RunWorker.
    const busEvents = events.list(runId);
    assert.ok(
      busEvents.some(
        (e) => e.processor === "RunWorker" && e.execution_status === "Running",
      ),
    );
    assert.ok(
      busEvents.some(
        (e) => e.processor === "RunWorker" && e.execution_status === "Completed",
      ),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker never re-executes an already-finalized run", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    let resolvedCount = 0;
    const deps = makeDeps(
      dir,
      runtime,
      async () => {
        resolvedCount++;
        return provider;
      },
      runs,
      events,
    );

    const runId = "test-run-2";
    runs.create(runId);
    runs.finish(runId, "Passed");

    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async () => {},
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "completed");
    assert.equal(resolvedCount, 0, "provider must not be re-resolved");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run worker finalizes infrastructure failures durably as ROOT_CAUSE", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const provider = new FixtureResearchProvider();

    const deps = makeDeps(
      dir,
      // Runtime that throws — simulates a mid-run infrastructure failure.
      {
        run: async () => {
          throw new Error("simulated infra failure");
        },
      } as unknown as WorkflowRuntime,
      async () => provider,
      runs,
      events,
    );

    const runId = "test-run-3";
    runs.create(runId);
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "sample",
        revision: 1,
      },
      updateProgress: async () => {},
    };

    const result = await executeRunJob(job, deps);
    assert.equal(result.status, "failed");

    const snap = runs.require(runId);
    assert.equal(snap.test_result, "Failed");
    assert.ok(snap.root_cause);
    assert.match(snap.root_cause!.issue, /simulated infra failure/);

    const complete = events
      .list(runId)
      .find((e) => e.processor === "RunWorker" && e.execution_status === "Completed");
    assert.ok(complete);
    assert.equal(complete.test_result, "Failed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("queue progress and bus events never carry secret material", async () => {
  const dir = tempDir();
  try {
    const events = new ProcessingEventBus();
    const runs = new RunRepository(join(dir, "run-state"));
    const runtime = fakeRuntime(runs);
    const provider = new FixtureResearchProvider();

    const deps = makeDeps(
      dir,
      runtime,
      async () => provider,
      runs,
      events,
    );

    const runId = "test-run-4";
    runs.create(runId);
    const progressCalls: Array<number | object> = [];
    const job: RunJobLike = {
      data: {
        runId,
        prompt: makePrompt(runId),
        providerId: "featherless",
        revision: 7,
      },
      updateProgress: async (p) => {
        progressCalls.push(p);
      },
    };

    // With a credential present in env, confirm it never lands in progress
    // payloads or bus events.
    process.env.FEATHERLESS_API_KEY = FAKE_SECRET;
    try {
      const result = await executeRunJob(job, deps);
      assert.equal(result.status, "completed");
      assert.ok(
        !JSON.stringify(progressCalls).includes(FAKE_SECRET),
        "no secret in progress",
      );
      assert.ok(
        !JSON.stringify(events.list(runId)).includes(FAKE_SECRET),
        "no secret in bus events",
      );
    } finally {
      delete process.env.FEATHERLESS_API_KEY;
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
