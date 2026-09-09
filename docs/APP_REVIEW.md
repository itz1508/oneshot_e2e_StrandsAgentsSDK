# App review

Review the current application using the [installation instructions](../README.md). The production interface is built from [app/web/app](../app/web/app/) and [app/web/components](../app/web/components/), and served by the OneShot backend.

## Browser walkthrough — September 9, 2026 (Strands runtime)

`scripts/e2e/browser/strands-ui-walkthrough.mjs` drives the CURRENT Next.js
workspace UI (headless Edge CDP) against the real Strands runtime in sample
mode. Verified end to end with screenshots and evidence JSON
(`dist/e2e-evidence/strands-walkthrough.json`,
`dist/e2e-evidence/screenshots-strands-walkthrough/`):

- Workspace mounts; chat request sent; intent collection enables Generate
  (`ready_for_prompt` + configured target).
- Research Review gate reached and accepted through the UI
  (`research-summary-card`).
- Stage rail completes all ten stages through the Strands Graph.
- Build Ready gate reached; Confirm Build executes the sandbox build.
- Result card shows VERIFIED EQUAL; backend snapshot matches
  (`test_result=Passed`, `pipeline_status=Done`, `hash_proof.equal=true`).
- Explorer lists the configured target workspace; Task Management renders
  plan steps.

Run via `npm run test:ui:walkthrough` (requires the server on :8787 in
sample mode with `ONESHOT_API_TOKEN` matching; see the script header). The
previous live-processing video predates the Strands port; this walkthrough
plus a fresh recording supersede it.


## Live walkthrough

1. Launch the application and open **Provider Configuration**.
2. Enter your provider credential, model, and API base URL, then choose **Save and activate**. Configuration errors appear in the dialog.
3. Send your project request, respond to the intent questions, and select a target workspace.
4. Start the workflow and review the Research Review and Build Ready gates before continuing.

A replacement recording of this interface with a configured live provider is pending. The previous video and legacy HTML are not current app-review evidence. The legacy HTML depends on backend APIs and cannot be used as a standalone attachment.

## Current local checks — September 9, 2026

Fixed readiness and stage indicators to use backend intent and recorded events; missing validation now reads Unavailable. A rejected Return keeps Build Ready open. Provider failures remain visible with a catalog retry, duplicate submissions are guarded, and dialogs restore keyboard focus when closed. Narrow screens use overlay side panels instead of squeezing the conversation.

Frontend typechecking, all 46 web tests, and the backend plus Next.js production build passed. A fixture-backed browser walkthrough reached Research Review and Build Ready, checked Return rejection with a controlled HTTP error, then confirmed a successful Return leaves authorization pending. Provider catalog failure/retry and dialog naming/Escape focus were checked in the browser.

This is local fixture evidence. Live provider activation and a replacement recording remain pending. Redis was unavailable, so these checks do not establish queued pipeline or deployment readiness.

[Repository index](../INDEX.md)

## Gap correction follow-up

The UI now requires the backend workspace context to report an explicitly configured target before starting Research. Set `ONESHOT_WORKSPACE_ROOT` to the intended project and restart the application; the application-default fallback cannot start a run from the UI. This does not introduce upload or target-switching contracts.

Transient session restoration errors preserve saved IDs; only a confirmed missing conversation clears them. Canonical processor names map to visible stage labels. Explorer uses current-run mutation evidence only, while historical mutations remain in Job History. Missing hash and mutation evidence now render as unavailable rather than verified, unequal, or empty.

Regression coverage includes canonical stage mapping and missing proof/mutation rendering. The previously recorded browser walkthrough predates these five follow-up fixes; no new live-provider or Redis proof is claimed.

Release checks for this follow-up: `npm run build:test` and `npm run verify` passed, including 147 passing Node tests and one skipped test. All 46 web tests and frontend typechecking passed. Redis connection warnings do not establish queued execution readiness.
