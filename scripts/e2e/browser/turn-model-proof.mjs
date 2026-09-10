// Turn-model proof: one user turn + ONE evolving assistant turn.
// Real browser (headless Edge CDP), real backend runtime. Asserts:
//  1. user turn appears immediately after send
//  2. assistant turn shows Working… (status=working) while backend runs
//  3. the SAME assistant turn becomes waiting_for_user with Research Review
//  4. exactly ONE assistant turn bubble exists during the whole exchange
//  5. build gate + completion still update that same turn
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
    sleep,
    waitFor,
    BASE,
    EVIDENCE,
    ROOT,
    EDGE,
    CDP,
} from "./cdp-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(EVIDENCE, "screenshots-turn-model");
mkdirSync(SHOTS, { recursive: true });

const results = { base: BASE, asserts: [], shots: [], passed: false };
let PASSED = true;
function record(name, pass, detail) {
    results.asserts.push({ name, pass: !!pass, detail: String(detail).slice(0, 400) });
    if (!pass) PASSED = false;
    console.log(`[${pass ? "PASS" : "FAIL"}] ${name} — ${String(detail).slice(0, 200)}`);
}

async function ev(expr) {
    const r = await cdp.send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
    });
    if (r.exceptionDetails) {
        throw new Error(
            "eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").slice(0, 300),
        );
    }
    return r.result?.value;
}
async function shot(name) {
    const raced = await Promise.race([
        cdp.send("Page.captureScreenshot", { format: "png" }).catch(() => null),
        sleep(12_000).then(() => null),
    ]);
    if (raced && raced.data) {
        writeFileSync(join(SHOTS, name), Buffer.from(raced.data, "base64"));
        results.shots.push(name);
    }
}
const SETTER =
    "Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set";

// dedicated throwaway profile → guaranteed fresh conversation, no storage
// races with the shared walkthrough profile
const PROFILE = join(ROOT, ".runtime", `e2e-profile-turnproof-${Date.now()}`);
const CDP_PORT = 9224;
const edge = spawn(
    EDGE,
    [
        "--headless=new",
        "--disable-gpu",
        `--remote-debugging-port=${CDP_PORT}`,
        `--user-data-dir=${PROFILE}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1680,1050",
        "about:blank",
    ],
    { stdio: "ignore" },
);
async function cdpTarget(port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const list = await (
                await fetch(`http://127.0.0.1:${port}/json/list`)
            ).json();
            const page = list.find((t) => t.type === "page");
            if (page) return page;
        } catch {
            /* browser still starting */
        }
        if (Date.now() > deadline) throw new Error("edge cdp target timeout");
        await sleep(300);
    }
}
const target = await cdpTarget(CDP_PORT, 30000);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, err) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", err, { once: true });
});
const cdp = new CDP(ws);
await cdp.send("Page.enable");
await cdp.send("Runtime.enable");
await cdp.send("Page.navigate", { url: BASE + "/" });
await sleep(2500);
await waitFor("composer", () => ev(`!!document.querySelector('#message')`), 20000);

// 1. one user send → one user turn
await ev(`(function(){
    const box = document.querySelector('#message');
    ${SETTER}.call(box, "Build a tiny token utilities module for review");
    box.dispatchEvent(new Event('input', { bubbles: true }));
    return box.value;
})()`);
await ev(`(function(){ document.querySelector('#send').click(); return "sent"; })()`);
await sleep(1200);
const userTurns = await ev(`(function(){
    return JSON.stringify(Array.from(document.querySelectorAll('[data-testid^="chat-message-"]')).map(e => (e.textContent||'').slice(0,90)));
})()`);
record("user turn appears immediately", String(userTurns).includes("token utilities"), userTurns);
await shot("turn-1-user-turn.png");

// 2. ONE assistant turn after send (working, or intent-ready hook when the
// sample backend answers synchronously)
const afterSend = await ev(`(function(){
    const els = Array.from(document.querySelectorAll('[data-testid="assistant-turn-status"]'));
    const bubbles = document.querySelectorAll('.message-bubble.assistant');
    const content = (document.querySelector('.message-bubble.assistant .turn-content')?.textContent || '').trim();
    return JSON.stringify({ n: els.length, cls: els.map(e => e.className), bubbles: bubbles.length, content });
})()`);
const afterSendParsed = JSON.parse(afterSend);
record(
    "one assistant turn after send",
    afterSendParsed.n === 1 && afterSendParsed.bubbles === 1 &&
        (/working/.test(afterSendParsed.cls[0]) ||
            /waiting_for_user/.test(afterSendParsed.cls[0])),
    afterSend,
);
if (/waiting_for_user/.test(afterSendParsed.cls[0] || "")) {
    record(
        "intent hook derived from backend state",
        /Generate/.test(afterSendParsed.content || ""),
        afterSendParsed.content,
    );
}
await shot("turn-2-after-send.png");

// 2b. Generate → real backend work → research gate in the SAME turn
await ev(`(function(){ document.querySelector('#generate').click(); return "generated"; })()`);
// tight status trace: the single turn must pass through working, then settle
// at the research gate, with exactly one assistant bubble at every read
const trace = [];
for (let i = 0; i < 90; i += 1) {
    const s = await ev(`(function(){
        const els = Array.from(document.querySelectorAll('[data-testid="assistant-turn-status"]'));
        const bubbles = document.querySelectorAll('.message-bubble.assistant').length;
        return JSON.stringify({ statuses: els.map(e => e.className.replace('turn-status turn-status-','')), bubbles });
    })()`);
    const parsed = JSON.parse(s);
    const sig = `${parsed.statuses.join(",")}|${parsed.bubbles}`;
    if (trace[trace.length - 1] !== sig) trace.push(sig);
    if (parsed.statuses.some((x) => /waiting_for_user/.test(x))) {
        const card = await ev(
            `!!document.querySelector('[data-testid="research-summary-card"]')`,
        );
        if (card) break;
    }
    await sleep(200);
}
await waitFor("research review card", () => ev(`!!document.querySelector('[data-testid="research-summary-card"]')`), 90000);
const sawWorking = trace.some((t) => t.includes("working"));
const singleBubbleAlways = trace.every((t) => t.endsWith("|1"));
record(
    "turn shows working phase (real backend run)",
    sawWorking,
    trace.slice(0, 8).join("  →  "),
);
record(
    "exactly one assistant bubble at every observation",
    singleBubbleAlways,
    trace.join("  →  "),
);
const waiting = await ev(`(function(){
    const e = document.querySelector('[data-testid="assistant-turn-status"]');
    const bubbles = document.querySelectorAll('.message-bubble.assistant').length;
    const content = (document.querySelector('.message-bubble.assistant .turn-content')?.textContent || '').trim();
    return JSON.stringify({ cls: e.className, text: e.textContent.trim(), bubbles, content });
})()`);
const waitingParsed = JSON.parse(waiting);
record(
    "SAME turn becomes research gate",
    waitingParsed.bubbles === 1 && /waiting_for_user/.test(waitingParsed.cls),
    waiting,
);
record("gate copy derived from backend state", waitingParsed.content.includes("Research is complete"), waitingParsed.content);
await shot("turn-3-research-review.png");

// 4. accept research → same turn at build gate
await ev(`(function(){ document.querySelector('[data-accept-research="true"]').click(); return "accepted"; })()`);
await waitFor("build review card", () => ev(`!!document.querySelector('[data-testid="build-review-card"]')`), 90000);
const atBuild = await ev(`(function(){
    const els = Array.from(document.querySelectorAll('[data-testid="assistant-turn-status"]'));
    return JSON.stringify({ n: els.length, cls: els.map(e => e.className) });
})()`);
const atBuildParsed = JSON.parse(atBuild);
record("same turn at Build Ready gate", atBuildParsed.n === 1 && /waiting_for_user/.test(atBuildParsed.cls[0]), atBuild);
await shot("turn-4-build-ready.png");

// 5. approve build → completed, still one bubble
await ev(`(function(){ document.querySelector('[data-gate-action="approve"]').click(); return "approved"; })()`);
await waitFor(
    "assistant turn → completed",
    () => ev(`!!document.querySelector('[data-testid="assistant-turn-status"].turn-status-completed')`),
    90000,
);
const done = await ev(`(function(){
    const els = Array.from(document.querySelectorAll('[data-testid="assistant-turn-status"]'));
    const bubbles = document.querySelectorAll('.message-bubble.assistant').length;
    return JSON.stringify({ n: els.length, bubbles, cls: els.map(e => e.className) });
})()`);
const doneParsed = JSON.parse(done);
record("same turn → completed (one bubble)", doneParsed.bubbles === 1 && doneParsed.n === 1 && /completed/.test(doneParsed.cls[0]), done);
await shot("turn-5-completed.png");

results.finished_at = new Date().toISOString();
results.passed = PASSED;
writeFileSync(join(EVIDENCE, "turn-model-proof.json"), JSON.stringify(results, null, 2));
console.log(`\n${results.asserts.filter((a) => a.pass).length}/${results.asserts.length} assertions passed`);
try {
    edge.kill();
} catch {
    /* already gone */
}
process.exit(PASSED ? 0 : 1);




