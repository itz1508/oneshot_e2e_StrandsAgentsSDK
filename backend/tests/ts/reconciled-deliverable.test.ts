import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { structuredDraftToResearchBundle } from "../../../app/web/cloud/provider/structured-draft.js";
import type { ResearchProvider } from "../../../app/web/cloud/provider.js";
import type { ConfirmedPackage } from "../../contracts/schema/types.js";
import type { BuilderWorkflowResult } from "../../agents/builder/workflow.js";
import { HardenedProcessRunner } from "../../sandbox/runner/process-runner.js";
import { runBuildStage, type StageServices } from "../../pipeline/processors.js";
import { saveArtifact } from "../../pipeline/context.js";
import { harness, prompt } from "./harness.js";

test("provider output survives canonical validation, real sandbox execution and durable build artifacts", async () => {
  const output = `Generated document ${randomUUID()} — preserve exact user-facing content.`;
  const draft = JSON.parse(await readFile("app/fixtures/provider/research-draft.json", "utf8"));
  draft.deliverable = output;
  const provider: ResearchProvider = {
    ready: async () => ({ ready: true, provider: "test", models: [], detail: "Explicit deterministic fixture" }),
    research: async (input, runId) => structuredDraftToResearchBundle({ projectRoot: resolve("."), prompt: input, runId, draft, gathered: [], providerSource: "test", providerProvenance: "deterministic-test", incompleteIssue: "invalid fixture", incompleteCorrection: "repair fixture" }),
  };
  const h = await harness(`reconciled-output-${randomUUID()}`, provider, new HardenedProcessRunner());
  const runId = `output-${randomUUID()}`;
  try {
    h.runs.create(runId);
    const snapshot = await h.runtime.run(runId, prompt(runId));
    assert.equal(snapshot.test_result, "Passed");
    assert.equal(snapshot.hash_proof?.equal, true);
    const builder = await h.store.load<BuilderWorkflowResult>(runId, "builder-result");
    assert.equal(builder.result, "Passed");
    assert.equal(builder.final_output, output);
    assert.ok(builder.output_step_id);
    assert.equal(builder.evidence.exit_codes.at(-1), 0);

    // The production queue uses build_result rather than builder-result.
    await h.store.save(runId, "hash_proof", snapshot.hash_proof);
    const confirmedPkg = await h.store.load<ConfirmedPackage>(runId, "confirmed");
    await h.runtime.buildReview.open(runId, confirmedPkg, snapshot.hash_proof!.created_hash);
    await h.runtime.buildReview.decide(runId, { action: "approve", hash: snapshot.hash_proof!.created_hash });
    await runBuildStage({ runId, runs: h.runs, store: h.store }, {
      builder: h.builder, events: { emit() {} }, saveArtifact, hash: h.hash,
    } as unknown as StageServices, () => {});
    const queued = await h.store.load<BuilderWorkflowResult>(runId, "build_result");
    assert.ok(queued.result === "Passed");
    assert.equal(queued.final_output, output);
    assert.equal(queued.hash_sandbox, snapshot.hash_proof?.created_hash);

    const confirmed = await h.store.load<ConfirmedPackage>(runId, "confirmed");
    confirmed.core.plan.steps.at(-1)!.description += "tamper";
    const rejected = await h.builder.run(confirmed, snapshot.hash_proof!.created_hash);
    assert.equal(rejected.result, "Failed");
    assert.equal(rejected.final_output, null);
    assert.equal(rejected.output_step_id, null);
  } finally { h.close(); }
});
