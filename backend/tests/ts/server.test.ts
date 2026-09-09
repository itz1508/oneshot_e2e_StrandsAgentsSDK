import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { harness } from "./harness.js";
import { startHttpServer } from "../../server/http-server.js";
import { RunRepository } from "../../runtime/run-repository.js";
import { TaskRuntimeSkill } from "../../skills/task-runtime-skill.js";

test("HTTP/UI product runs chain and durable run snapshot reloads", async () => {
  const root = resolve(".runtime/test-harness/state/server");
  await rm(root, { recursive: true, force: true });
  const h = await harness("server");
  const server = await startHttpServer(
    h.runtime,
    h.runs,
    h.events,
    resolve("app/web/dist"),
    0,
    h.task,
  );
  try {
    const a = server.address();
    assert.ok(a && typeof a === "object");
    const base = `http://127.0.0.1:${a.port}`;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.ok(health.headers.get("content-security-policy"));
    const start = (await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }).then((r) => r.json())) as { run_id: string };
    let snap: any;
    for (let i = 0; i < 120; i++) {
      snap = await fetch(`${base}/api/runs/${start.run_id}`).then((r) =>
        r.json(),
      );
      if (snap.test_result) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(snap.test_result, "Passed");
    assert.equal(snap.hash_proof.equal, true);
    const task = (await fetch(`${base}/api/runs/${start.run_id}/task`).then(
      (r) => r.json(),
    )) as any;
    assert.equal(task.checkpoint.last_processor, "Done");
    const taskSkill = new TaskRuntimeSkill(h.task, h.runs);
    const skillProjection = await taskSkill.invoke<any>("project_run", {
      run_id: start.run_id,
    });
    assert.equal(skillProjection.checkpoint.last_processor, "Done");
    assert.deepEqual(
      taskSkill
        .definitions()
        .map((x) => x.name)
        .sort(),
      [
        "audit_run",
        "project_authority_graph",
        "project_run",
        "project_strands_graph",
      ],
    );
    const audit = (await fetch(`${base}/api/runs/${start.run_id}/audit`).then(
      (r) => r.json(),
    )) as any;
    assert.equal(audit.ordering.valid, true);
    assert.ok(
      audit.events.every(
        (e: any) => e.event_id && e.correlation_id && e.traceparent,
      ),
    );
    assert.equal((await fetch(`${base}/`)).status, 200);
    const reloaded = new RunRepository(resolve(".runtime/test-harness/state/server"));
    const durable = reloaded.get(start.run_id);
    assert.equal(durable?.test_result, "Passed");
    assert.ok(
      durable?.events.some(
        (e) => e.processor === "Done" && e.test_result === "Passed",
      ),
    );
  } finally {
    try {
      server.closeAllConnections?.();
      await new Promise<void>((ok) => server.close(() => ok()));
    } catch {}
    h.bridge.close();
  }
});
