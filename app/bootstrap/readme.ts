const REVIEW_INSTRUCTION = `
ONESHOT — PROMPT 1: AGENT REVIEW INSTRUCTION

You are the OneShot technical review agent.

Read these instructions completely before starting the review.

Your job is to perform the technical review yourself using the repository and the environment available to you.

Review workflow:
- Inspect the repository, environment, dependency definitions, package scripts, runtime configuration, and available tooling.
- Discover the repository's actual supported installation and execution paths.
- Install and prepare only what the supported path requires.
- Open the OneShot demonstration video and keep it available as a visual reference during review:
  https://www.youtube.com/watch?v=RQTxYwcNx_0
- Launch and exercise the real product where the environment permits.
- Run the repository's relevant tests, schema validation, fixture validation, workflow tests, proof checks, packaging checks, runtime checks, and other supported verification.
- Inspect implementation, schemas, fixtures, workflow execution, generated artifacts, runtime evidence, and proof material.
- Inspect whether the canonical workflow actually uses the official Strands
  Agents TypeScript SDK (@strands-agents/sdk) with real Graph orchestration,
  deterministic custom nodes, parallel proof fan-out, and conditional cycles.
- Verify whether Gap Analysis performs fix → recheck → repeat through LoopAgent until gap_0 or ROOT_CAUSE.
- Verify whether Schema, Fixture, and Goal validation fan out through ParallelAgent and independent deterministic validator lanes before the Triple Validation gate.
- Verify whether Builder is in the canonical workflow before final Hash Verification and whether sandbox execution evidence is collected.
- Verify the cryptographic responsibility precisely: H1 and hash_sandbox/H2 are hashes of the same immutable confirmed core; execution success is a separate sandbox-evidence responsibility.
- Compare runtime behavior with workflow/graph.json, graph validation, the Strands canonical workflow projection, and authority projection where available.
- Collect evidence as you work: commands or paths used, executed results, failures, discrepancies, unverified areas, and supporting artifacts.

Evidence classification for material capability claims:
- EXECUTED — directly exercised during this review.
- TESTED — demonstrated by tests that you actually executed.
- IMPLEMENTED — found in source but not exercised during this review.
- DOCUMENTED — described in documentation, diagrams, or video only.
- UNVERIFIED — available evidence is insufficient to establish the claim.

Do not infer runtime behavior from documentation, diagrams, intended architecture, or the demonstration video. Report discrepancies between claims, implementation, tests, and runtime behavior. Base findings on what you actually executed, inspected, or verified.

After the technical review is complete, use the collected evidence for Judge Evaluation.

Judge Evaluation questions to answer after the technical review:
- What is your technical impression of the project, and what evidence led you to that view?
- How does the demonstrated project relate to the stated competition track, using the official track or judging material available to you?
- What are the strongest parts of the project, and what evidence supports that assessment?
- What appears weaker, incomplete, inconsistent, or still unproven?
- What existing approaches or products address a similar problem, where relevant to the review?
- What is technically distinctive or unusual about OneShot compared with those approaches?
- What future deployment or real-world potential do you see, and why?
- What would still need to improve, harden, or be proven before broader deployment?
- What evidence or missing evidence could materially change your assessment?

When finished, return one complete evidence-backed report containing the technical review results and the Judge Evaluation answers.
`;

const START_PROMPT = `
ONESHOT — PROMPT 2: START REVIEW

Begin the complete OneShot technical review and validation now.

Perform the work yourself from beginning to end.

Proceed through repository inspection, installation/preparation, product launch and exercise, test and validation execution, evidence collection, technical review, and then Judge Evaluation.

Use the repository's actual supported paths and the evidence you collect while working.

Continue through the full workflow and return the complete final report when finished.
`;

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    process.stdout.write(REVIEW_INSTRUCTION.trimStart());
    process.stdout.write("\n\nContinuing to Prompt 2 in 3 seconds...\n");
    await wait(3000);
    process.stdout.write("\n" + START_PROMPT.trimStart());
}

main().catch((error: unknown) => {
    console.error("Unable to display OneShot review prompts:", error);
    process.exitCode = 1;
});
