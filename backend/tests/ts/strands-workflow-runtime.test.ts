import test from "node:test";
import assert from "node:assert/strict";
import { harness, prompt } from "./harness.js";

test("full OneShot workflow executes through the Strands Agents canonical graph", async () => {
  const h = await harness("strands-runtime");
  const jobId = "strands-runtime-001";
  try {
    h.runs.create(jobId);
    const snapshot = await h.runtime.run(jobId, prompt(jobId));

    assert.equal(snapshot.pipeline_status, "Done");
    assert.equal(snapshot.test_result, "Passed");
    assert.ok(snapshot.hash_proof, "expected a hash proof");
    assert.equal(snapshot.hash_proof?.equal, true);
    const events = h.events;
    void events;
    console.log("STRANDS_RUNTIME_SNAPSHOT_JSON=" + JSON.stringify(snapshot));
  } finally {
    h.close();
  }
});
