import test from "node:test";
import assert from "node:assert/strict";
import { FeatherlessResearchProvider } from "../../../app/web/cloud/provider/featherless/provider.js";
import { WorkflowRootCauseError } from "../../core/root-cause-error.js";
import { harness, prompt } from "./harness.js";

test("Featherless Gemma provider boundary executes canonical chain in deterministic adapter mode", async () => {
  const saved = {
    mode: process.env.ONESHOT_MODE,
    draft: process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE,
    parallel: process.env.FEATHERLESS_NUM_PARALLEL,
    model: process.env.FEATHERLESS_MODEL,
  };
  process.env.ONESHOT_MODE = "test";
  process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE =
    "app/fixtures/provider/research-draft.json";
  process.env.FEATHERLESS_NUM_PARALLEL = "2";
  delete process.env.FEATHERLESS_MODEL;

  const provider = new FeatherlessResearchProvider(process.cwd(), {
    testDraftFile: process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE,
    model: "google/gemma-4-31B-it",
    baseUrl: "https://api.featherless.ai/v1",
    workerPoolSize: 1,
    timeoutSeconds: 30,
    maxTokens: 4096,
  });
  const runtime = await harness("featherless-provider", provider);
  const runId = "featherless-provider";
  runtime.runs.create(runId);

  try {
    const output = await runtime.runtime.run(runId, prompt(runId));
    assert.equal(output.test_result, "Passed");
    assert.equal(output.hash_proof?.equal, true);

    const research = await runtime.store.load<any>(runId, "researcher");
    assert.match(
      research.evidence[0].source,
      /featherless:google\/gemma-4-31B-it/,
    );
    assert.equal(research.researcher_id, `researcher:${runId}`);
    assert.equal(research.prompt_id, `prompt:${runId}`);
    assert.equal(research.requirement_ids.length, 2);

    const plan = await runtime.store.load<any>(runId, "plan.researcher");
    assert.equal(
      plan.dependencies[0].required_by[0],
      research.requirement_ids[1],
    );
    assert.ok(
      output.events.some(
        (event) =>
          event.scope === "SUPPORT" &&
          event.processor ===
            "Provider:featherless:researcher-provider" &&
          event.execution_status === "Completed",
      ),
    );
    } finally {
    provider.close?.();
    runtime.bridge.close();
    const names = {
      mode: "ONESHOT_MODE",
      draft: "ONESHOT_FEATHERLESS_TEST_DRAFT_FILE",
      parallel: "FEATHERLESS_NUM_PARALLEL",
      model: "FEATHERLESS_MODEL",
    } as const;
    for (const [key, value] of Object.entries(saved)) {
      const name = names[key as keyof typeof names];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Featherless provider reports a safe root cause when server-side authentication is missing", async () => {
  const savedKey = process.env.FEATHERLESS_API_KEY;
  delete process.env.FEATHERLESS_API_KEY;
  const provider = new FeatherlessResearchProvider(process.cwd(), {
    model: "google/gemma-4-31B-it",
    baseUrl: "https://api.featherless.ai/v1",
    workerPoolSize: 1,
    timeoutSeconds: 10,
    maxTokens: 4096,
  });
  try {
    await assert.rejects(
      () => provider.research(prompt("featherless-no-auth"), "no-auth"),
      (error: unknown) => {
        assert.ok(error instanceof WorkflowRootCauseError);
        assert.equal(
          error.rootCause.issue,
          "Featherless research provider failed",
        );
        assert.match(
          error.rootCause.actual,
          /FEATHERLESS_API_KEY is not configured/,
        );
        return true;
      },
    );
  } finally {
    provider.close();
    if (savedKey === undefined) delete process.env.FEATHERLESS_API_KEY;
    else process.env.FEATHERLESS_API_KEY = savedKey;
  }
});

test("Production Featherless failure produces ROOT_CAUSE and never silently falls back to fixture", async () => {
  const saved = {
    mode: process.env.ONESHOT_MODE,
    key: process.env.FEATHERLESS_API_KEY,
    draft: process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE,
  };
  process.env.ONESHOT_MODE = "production";
  delete process.env.FEATHERLESS_API_KEY;
  process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE = "app/fixtures/product/complete-success-seed.json";

  const provider = new FeatherlessResearchProvider(process.cwd(), {
    model: "google/gemma-4-31B-it",
    baseUrl: "https://api.featherless.ai/v1",
    workerPoolSize: 1,
    timeoutSeconds: 10,
    maxTokens: 4096,
  });
  try {
    const runtime = await harness("featherless-no-fallback", provider);
    const runId = "featherless-no-fallback";
    runtime.runs.create(runId);

    try {
      const output = await runtime.runtime.run(runId, prompt(runId));
      assert.equal(output.test_result, "Failed");
      assert.equal(output.root_cause?.issue, "Featherless research provider failed");
      assert.match(output.root_cause?.actual || "", /FEATHERLESS_API_KEY is not configured/);
    } finally {
      provider.close?.();
      runtime.bridge.close();
    }
  } finally {
    if (saved.mode === undefined) delete process.env.ONESHOT_MODE;
    else process.env.ONESHOT_MODE = saved.mode;
    if (saved.key === undefined) delete process.env.FEATHERLESS_API_KEY;
    else process.env.FEATHERLESS_API_KEY = saved.key;
    if (saved.draft === undefined) delete process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE;
    else process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE = saved.draft;
  }
});
