# OneShot — Demo Video Kit (≤ 5 minutes, Agents for Humans)

Everything needed to record the submission video: specs, a timecoded
storyboard, the full voiceover script, captions, a recording checklist, and
publishing steps. Target length **4:45** (hard cap 5:00). The pitch covers
the three required beats: **the problem** (0:00), **who it's for** (0:20),
and **why it matters** (0:40 and 4:30). Screen recordings + voiceover only.

## 1. Deliverable specs

| Property | Value |
| --- | --- |
| Length | 4:45 target, 5:00 hard cap |
| Resolution / frame rate | 1920×1080, 30 fps |
| Audio | Voiceover only; normalize to about −16 LUFS |
| Format | MP4 (H.264 + AAC) |
| Captions | Burn in the storyboard captions; export `.srt` too |
| File name | `oneshot-strands-demo-2026-09.mp4` |

## 2. Record in sample mode (reproducible, no keys)

```powershell
Copy-Item app/env/.env.example app/env/.env
# edit app/env/.env:  ONESHOT_WORKSPACE_ROOT=<path to a scratch target project>
npm run demo
# opens http://localhost:8787
```

Prepare a small scratch target project so the Builder's sandbox writes land
somewhere visible in the Explorer.

## 3. Storyboard

| Time | Screen | Action | On-screen caption |
| --- | --- | --- | --- |
| 0:00–0:20 | Slide 1 | Title card over a chat where an agent silently rewrites files | "AI coding agents are fast — and unaccountable." |
| 0:20–0:40 | Slide 2 | Split: dev team / approval checklist | "Built for teams who must prove what they approved." |
| 0:40–1:00 | OneShot UI shell | Pan across the five-region workspace | "OneShot: works in the background, surfaces only for decisions." |
| 1:00–1:30 | Strands slide | `backend/workflow/strands/` + architecture diagram | "Orchestrated by a real Strands Agents Graph." |
| 1:30–2:10 | Demo A — gate 1 | Chat the request, answer intent questions, Researcher runs, Research Review card → **Accept** | "🛑 Human gate 1: nothing proceeds until you accept." |
| 2:10–3:00 | Demo B — plan → proof | Planner → Refactor → Gap cycle → Evaluation; Triple Validation shows Schema/Fixture/Goal **VALID**; CONFIRMED + hash | "Three deterministic validators. One immutable hash." |
| 3:00–3:50 | Demo C — gate 2 → build | Build Ready card, **Confirm Build**, sandbox execution, `HASH == hash_sandbox`, **DONE**; Job History + Explorer | "🛑 Human gate 2: only the approved package executes." |
| 3:50–4:15 | Trust recap | Architecture diagram highlighting gates + hash equality | "Six governed stages. Two gates. One hash." |
| 4:15–4:45 | Close | Repo page with Apache-2.0 badge + `npm run demo` | "Try it: github.com/itz1508/oneshot_e2e_StrandsAgentsSDK" |

## 4. Voiceover script (~115 wpm; leave 1–2 s between beats)

**0:00 — The problem (~50 words).** "AI coding agents are fast. They can
research, plan, and write software in minutes. But they also rewrite files
when you are not looking, claim success they cannot prove, and leave no
trace of what you actually approved. If you are shipping that code, that is
a problem."

**0:20 — Who it's for (~40 words).** "OneShot is for developers and teams
who need autonomous builds they can prove — teams adopting AI agents under
review or compliance requirements, where 'which artifact did we approve,
and does the build match it' has to be answerable after the fact."

**0:40 — What OneShot is (~40 words).** "OneShot is a build agent with two
hard guarantees. It works in the background and only surfaces when there is
a real decision to make. And it only succeeds when the build matches exactly
what you approved. Let me show you."

**1:00 — Strands (~35 words).** "The entire pipeline is a Strands Agents
Graph. Deterministic nodes for every stage, parallel proof lanes, bounded
cycles for gap analysis and refinement — real SDK orchestration, not a
wrapper."

**1:30 — Demo A: gate 1 (~60 words).** "I will ask for a small CLI app.
OneShot clarifies intent first — it will not start until the request is
unambiguous. Then the Researcher produces the research bundle: plan,
schema, fixtures, goals. And here is the first human gate: Research Review.
The pipeline is physically stopped until I accept."

**2:10 — Demo B: plan → proof (~70 words).** "The plan moves through
Planner, Refactor, and a bounded Gap Analysis cycle that fixes and rechecks
until zero gaps remain. Then the part I trust most: triple validation.
Three independent deterministic validators — schema, fixture, goal — must
all return VALID. No LLM grades its own homework. The package is confirmed
and hashed."

**3:00 — Demo C: gate 2 → build (~75 words).** "Second human gate: Build
Ready. The card shows exactly what I am approving — every validation and
the hash. I confirm. Only now does the Builder run, inside a hardened
sandbox with no network. And the proof: the hash recomputed from the built
output must equal the hash I approved. They match — DONE."

**3:50 — Trust recap (~30 words).** "Six governed stages. Two mandatory
human gates. One hash binding approval to execution. Durable, checkpointed,
and reproducible on your machine."

**4:15 — Close: problem, who, why (~45 words).** "The problem: agents you
cannot trust. Who it is for: teams who must prove what they approved. Why
it matters: because 'the AI did it' is not an audit trail — a hash is.
OneShot is open source under Apache-2.0: `npm run demo`. Link below."

## 5. Shot and recording checklist

1. Run `npm run demo` once before recording to confirm the sample run
   reaches DONE end to end.
2. Prepare a scratch target project and set `ONESHOT_WORKSPACE_ROOT` in
   `app/env/.env`.
3. Browser: zoom 110–125 %, hide bookmarks, do-not-disturb on. Terminal:
   font ≥ 16, dark background, clear before each command.
4. Record segments separately (Slides, Demo A–C, recap) so one mistake
   never costs the whole take; keep each gate on screen ≥ 2 s.
5. Trim dead waits; burn in the captions; end card for the last 3 s.
6. Export 1920×1080 / 30 fps / H.264, ≤ 5:00 (target 4:45).

## 6. Fair-claims guardrails

- Show the "Deterministic Sample Provider" label during demos; do not
  claim a live-provider run on camera.
- If Redis/worker is not running, runs execute in-process; say so if asked.
- Only claim what is visible. Missing hash or mutation evidence renders as
  "unavailable" — never annotate it as verified.

## 7. Publish and link

1. Upload to YouTube as **unlisted**: "OneShot — human-gated, hash-verified
   builds on Strands (Agents for Humans)". Description: repo URL + chapter
   timestamps.
2. Save the file to `docs/evidence/video/oneshot-strands-demo-2026-09.mp4`.
3. Paste the YouTube URL into the Devpost form and the
   [README demo section](../README.md#demo-video).
4. If the `.mp4` is committed, regenerate and verify the manifest:
   `python app/scripts/generate_manifest.py` then
   `python app/scripts/verify_manifest.py`.
