import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { AppendOnlyProcessingEventStore } from "../../task/event/event-store.js";
import { ProcessingEventBus } from "../../runtime/event-bus.js";
import { detectOrderingIssues } from "../../task/guard/ordering.js";
import { projectStrandsGraph } from "../../graph/strands-graph.js";

test("Task event stream is append-only, replayable, traced, and Strands-projectable", async () => {
  const root = resolve(`.runtime/test-harness/task-store/${process.pid}`);
  await rm(root, { recursive: true, force: true });
  const store = new AppendOnlyProcessingEventStore(root),
    bus = new ProcessingEventBus(store);

  bus.emit("r1", "Researcher", "Pending");
  bus.emit("r1", "Researcher", "Running");
  bus.emit("r1", "Strands:cache", "Running", { scope: "SUPPORT", message: "lookup" });
  bus.emit("r1", "Strands:cache", "Completed", { scope: "SUPPORT", message: "hit" });
  bus.emit("r1", "Researcher", "Completed", { test_result: "Passed" });

  const reloaded = new AppendOnlyProcessingEventStore(root).list("r1");
  assert.equal(reloaded.length, 5);
  assert.deepEqual(
    reloaded.map((e) => e.sequence),
    [1, 2, 3, 4, 5],
  );
  assert.ok(
    reloaded.every(
      (e) =>
        e.event_id &&
        e.correlation_id === "run:r1" &&
        /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/.test(e.traceparent),
    ),
  );
  assert.equal(reloaded[1].causation_id, reloaded[0].event_id);
  assert.equal(detectOrderingIssues(reloaded).length, 0);
  const graph = projectStrandsGraph(reloaded);
  assert.equal(
    graph.nodes.find((n) => n.id === "Provider:cache")?.state,
    "Completed",
  );
  assert.equal(graph.root_agent.type, "Graph");
});
