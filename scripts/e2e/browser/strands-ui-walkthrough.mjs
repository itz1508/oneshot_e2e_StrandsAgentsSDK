/**
 * OneShot Strands UI walkthrough — drives the REAL runtime (:8787) through
 * headless Edge CDP against the CURRENT Next.js workspace UI.
 *
 * Verifies the full product experience the demo video shows:
 *   chat → intent → Generate → Research Review gate (Accept)
 *   → canonical stages → Build Ready gate (Confirm Build)
 *   → sandbox build → HASH == hash_sandbox → DONE (VERIFIED EQUAL)
 * with screenshots + evidence JSON at every step.
 *
 * Usage:
 *   set ONESHOT_API_TOKEN=<token>   (must match the server's token)
 *   node scripts/e2e/browser/strands-ui-walkthrough.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchBrowser,
  waitFor,
  sleep,
  TOKEN,
  BASE,
  EVIDENCE,
} from "./cdp-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(EVIDENCE, "screenshots-strands-walkthrough");
mkdirSync(SHOTS, { recursive: true });

const results = {
  started_at: new Date().toISOString(),
  base: BASE,
  asserts: [],
  steps: [],
  console_errors: [],
  http_errors: [],
  shots: [],
  run_id: null,
  finished_at: null,
  passed: false,
};
let PASSED = true;
function record(action, expected, observed, pass) {
  results.asserts.push({ action, expected, observed, pass: !!pass });
  if (!pass) PASSED = false;
  console.log(
    `[${pass ? "PASS" : "FAIL"}] ${action}\n  expected: ${expected}\n  observed: ${observed}`,
  );
}
function step(msg) {
  results.steps.push({ at: new Date().toISOString(), msg });
  console.log(`[step] ${msg}`);
}

const cdp = await launchBrowser();
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Network.enable");
cdp.on("Runtime.consoleAPICalled", (p) => {
  if (p.type !== "error") return;
  const t = (p.args ?? [])
    .map((a) => a.value ?? a.description ?? "")
    .join(" ")
    .slice(0, 300);
  if (!t.includes("Download the React DevTools"))
    results.console_errors.push(t);
});
cdp.on("Network.responseReceived", (p) => {
  const st = p.response?.status ?? 0;
  if (st >= 400 && st !== 404) {
    results.http_errors.push({
      status: st,
      url: String(p.response?.url ?? "").slice(0, 200),
    });
  }
});

async function ev(expr) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      "eval failed: " +
        (r.exceptionDetails.text || "") +
        " " +
        (r.exceptionDetails.exception?.description || "").slice(0, 300),
    );
  }
  return r.result?.value;
}
async function shot(name) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const raced = await Promise.race([
      cdp
        .send("Page.captureScreenshot", { format: "png" })
        .catch(() => null),
      sleep(12_000).then(() => null),
    ]);
    if (raced && raced.data) {
      writeFileSync(join(SHOTS, name), Buffer.from(raced.data, "base64"));
      results.shots.push(name);
      return;
    }
    await sleep(600);
  }
  results.shots.push(`${name} (skipped: capture timeout)`);
  console.log(`[shot] skipped ${name} (capture timeout)`);
}
const SETTER =
  "Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set";

async function dumpDiagnostics(reason) {
  try {
    await shot("99-failure-state.png");
    const state = await ev(
      `(function(){
        return JSON.stringify({
          chatTurns: document.querySelectorAll('[data-testid^="chat-message-"]').length,
          composerValue: (document.querySelector('#message')?.value || '').slice(0, 80),
          generatePresent: !!document.querySelector('#generate'),
          sendDisabled: document.querySelector('#send')?.disabled,
          researchPill: document.querySelector('[data-testid="research-summary-card"] .card-status-pill')?.textContent || '',
          buildPill: document.querySelector('[data-testid="build-review-card"] .card-status-pill')?.textContent || '',
          stageDone: document.querySelectorAll('.stage-node.done').length,
          errorBanner: (document.querySelector('[aria-label="Dismiss error"]')?.closest('div')?.textContent || '').slice(0, 300),
          bodySnippet: document.body.textContent.replace(/\\s+/g, ' ').slice(0, 500),
        });
      })()`,
    );
    results.failure = { reason: String(reason?.message || reason), state: JSON.parse(String(state)) };
  } catch (dumpError) {
    results.failure = {
      reason: String(reason?.message || reason),
      dump_error: String(dumpError?.message || dumpError),
    };
  }
  results.finished_at = new Date().toISOString();
  results.passed = false;
  writeFileSync(join(EVIDENCE, "strands-walkthrough.json"), JSON.stringify(results, null, 2));
  console.error(`\n[walkthrough failed] ${String(reason?.message || reason)}`);
  console.error(`[evidence] ${join(EVIDENCE, "strands-walkthrough.json")}`);
  process.exit(1);
}
process.on("unhandledRejection", (e) => void dumpDiagnostics(e));
process.on("uncaughtException", (e) => void dumpDiagnostics(e));

async function typeIntoComposer(text) {
  await ev(`(function(){
    const el = document.querySelector('#message');
    if (!el) throw new Error('composer #message not found');
    el.focus();
    return true;
  })()`);
  await cdp.send("Input.insertText", { text });
  await sleep(150);
  await waitFor(
    "composer send enabled",
    async () =>
      (await ev(
        `!!document.querySelector('#send') && !document.querySelector('#send').disabled`,
      ))
        ? true
        : undefined,
    { timeout: 10_000, poll: 150 },
  );
  await ev(`document.querySelector('#send').click()`);
}

// ---------- Navigate + authenticate ----------
await cdp.send("Page.navigate", { url: BASE });
step("Navigated to real runtime " + BASE);
await waitFor("workspace html", async () =>
  (await ev("!!document.querySelector('textarea')")) ? true : undefined,
  { timeout: 30_000 },
);
await ev(
  `sessionStorage.setItem('oneshot.accessToken', ${JSON.stringify(TOKEN)})`,
);
await ev(`localStorage.removeItem('oneshot.currentConversationId')`);
await cdp.send("Page.reload");
await waitFor("workspace mounted", async () =>
  (await ev("!!document.querySelector('[data-testid=\"chat-view\"]')"))
    ? true
    : undefined,
  { timeout: 30_000 },
);
record("Workspace UI mounted", "chat-view present", "present", true);
await shot("01-workspace-loaded.png");

// ---------- Send the project request ----------
const REQUEST_TEXT =
  "Build a compact TypeScript CLI note-taking app in the target workspace. " +
  "Requirements: add/list/search commands, JSON file storage, include tests, " +
  "and keep the implementation deterministic.";
await typeIntoComposer(REQUEST_TEXT);
step("Project request sent");
await shot("02-request-sent.png");

// ---------- Intent loop until Generate is enabled ----------
let generateReady = false;
for (let round = 0; round < 5; round += 1) {
  const ready = await waitFor(
    `generate enabled (round ${round + 1})`,
    async () => {
      const ok = await ev(
        `(function(){ const g = document.querySelector('#generate'); return !!g && !g.disabled; })()`,
      );
      return ok ? true : undefined;
    },
    { timeout: round === 0 ? 90_000 : 45_000, poll: 500 },
  )
    .then(() => true)
    .catch(() => false);
  if (ready) {
    generateReady = true;
    break;
  }
  step(`Intent round ${round + 1}: answering follow-up question`);
  await typeIntoComposer(
    "Use the existing target workspace. Keep it compact and deterministic; " +
      "no external network access is needed.",
  );
}
record(
  "Generate enabled after intent collection",
  "#generate enabled (ready_for_prompt + configured target)",
  generateReady ? "enabled" : "disabled",
  generateReady,
);
if (!generateReady) throw new Error("Generate never became enabled");
await shot("03-generate-ready.png");

// ---------- Generate: start the canonical run ----------
await ev(`document.querySelector('#generate').click()`);
step("Generate clicked — canonical run starting");

// ---------- HUMAN GATE 1: Research Review ----------
await waitFor(
  "research review card awaiting acceptance",
  async () => {
    const pill = await ev(
      `document.querySelector('[data-testid="research-summary-card"] .card-status-pill')?.textContent || ''`,
    );
    return String(pill).includes("Awaiting acceptance")
      ? String(pill)
      : undefined;
  },
  { timeout: 240_000, poll: 500 },
);
record(
  "Research Review gate reached",
  "research-summary-card pill = Awaiting acceptance",
  "awaiting",
  true,
);
await shot("04-research-review-gate.png");

await ev(
  `document.querySelector('[data-accept-research="true"]').click()`,
);
step("Research accepted");
await waitFor(
  "research baseline accepted",
  async () => {
    const pill = await ev(
      `document.querySelector('[data-testid="research-summary-card"] .card-status-pill')?.textContent || ''`,
    );
    return String(pill).includes("baseline") ? String(pill) : undefined;
  },
  { timeout: 90_000, poll: 500 },
);
record("Research Review gate accepted", "pill = Research baseline", "accepted", true);
await shot("05-research-accepted.png");

// ---------- Canonical stages progress ----------
await waitFor(
  "planner and refactor completed",
  async () => {
    const done = await ev(
      `document.querySelectorAll('.stage-node.done').length`,
    );
    return done >= 3 ? done : undefined;
  },
  { timeout: 300_000, poll: 1000 },
);
step("Planner/Refactor stages completed on the stage rail");
await shot("06-stages-progressing.png");

// ---------- HUMAN GATE 2: Build Ready ----------
await waitFor(
  "build ready card",
  async () => {
    const ok = await ev(
      `!!document.querySelector('[data-testid="build-review-card"]')`,
    );
    return ok ? true : undefined;
  },
  { timeout: 420_000, poll: 1000 },
);
const stageDone = await ev(`document.querySelectorAll('.stage-node.done').length`);
record(
  "Build Ready gate reached",
  "build-review-card present with prior stages completed",
  `stage-node.done=${stageDone}`,
  stageDone >= 6,
);
await shot("07-build-ready-gate.png");

await ev(
  `document.querySelector('[data-testid="build-review-card"] [data-gate-action="approve"]').click()`,
);
step("Build confirmed — Builder executing in sandbox");

// ---------- DONE: verified hash proof ----------
await waitFor(
  "verified equal hash proof",
  async () => {
    const ok = await ev(`document.body.textContent.includes('VERIFIED EQUAL')`);
    return ok ? true : undefined;
  },
  { timeout: 420_000, poll: 1000 },
);
const allDone = await ev(`document.querySelectorAll('.stage-node.done').length`);
record(
  "Run DONE with VERIFIED EQUAL hash proof",
  "ResultCard shows VERIFIED EQUAL; all 10 stage nodes done",
  `stage-node.done=${allDone}/10`,
  allDone >= 10,
);
await shot("08-verified-done.png");

// ---------- Backend truth + Task Management + Explorer ----------
const runId = await ev(
  `(function(){
    const cards = Array.from(document.querySelectorAll('section.card'));
    const done = cards.find((c) => c.textContent.includes('VERIFIED EQUAL'));
    return done ? (done.querySelector('code.mono')?.textContent || '') : '';
  })()`,
);
record(
  "Result card exposes the completed run id",
  "non-empty run_id from the VERIFIED EQUAL card",
  runId || "missing",
  !!runId,
);
const api = await ev(
  `(async function(){
    const token = sessionStorage.getItem('oneshot.accessToken') || '';
    const id = ${JSON.stringify(runId)};
    const r = await fetch('/api/runs/' + encodeURIComponent(id), {
      headers: { Authorization: 'Bearer ' + token },
    });
    return r.status === 200
      ? JSON.stringify(await r.json())
      : JSON.stringify({ status: r.status });
  })()`,
);
const run = JSON.parse(String(api));
results.run_id = runId;
record(
  "Backend run state matches the UI",
  "test_result=Passed · pipeline_status=Done · hash_proof.equal=true",
  `test_result=${run.test_result}, status=${run.pipeline_status}, equal=${run.hash_proof?.equal}`,
  run.test_result === "Passed" &&
    run.pipeline_status === "Done" &&
    run.hash_proof?.equal === true,
);

const explorerHasTarget = await ev(
  `(document.querySelector('[data-testid="workspace-tree"]')?.textContent || '').includes('README.md')`,
);
record(
  "Explorer shows the configured target workspace",
  "workspace-tree lists README.md",
  explorerHasTarget ? "README.md listed" : "missing",
  explorerHasTarget === true,
);

const taskPanel = await ev(
  `(function(){
    const panel = document.querySelector('[aria-label="Task Management"]');
    return {
      present: !!panel,
      text: panel ? panel.textContent.slice(0, 400) : '',
    };
  })()`,
);
record(
  "Task Management panel renders plan steps",
  "panel present with step content",
  taskPanel.present ? `present (${taskPanel.text.length} chars)` : "missing",
  taskPanel.present === true && taskPanel.text.length > 0,
);
await shot("09-task-management-explorer.png");

// ---------- Evidence + exit ----------
results.finished_at = new Date().toISOString();
results.passed = PASSED;
const outFile = join(EVIDENCE, "strands-walkthrough.json");
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.log(`\n[evidence] ${outFile}`);
console.log(`[screenshots] ${SHOTS}`);
console.log(
  PASSED
    ? "\nRESULT: PASS — full UI walkthrough verified (gates, stages, hash proof)"
    : "\nRESULT: FAIL — see asserts above",
);
process.exit(PASSED ? 0 : 1);
