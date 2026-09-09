import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  FixtureValidationResult,
  GapAnalysis,
  GoalValidationResult,
  HashProof,
  Plan,
  Prompt,
  ResearchBundle,
  RootCause,
  SchemaValidationResult,
  TripleValidation,
} from "../../contracts/schema/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import type { GapFinding } from "../../agents/gap-analysis/tool/coverage.js";

/**
 * Canonical workflow scratch state keys. Durable OneShot artifacts remain owned
 * by ArtifactStore / RunRepository; this state is orchestration-only.
 */
export const WORKFLOW_STATE = {
  runId: "oneshot.run_id",
  prompt: "oneshot.prompt",

  bundle: "oneshot.bundle",
  audit: "oneshot.audit",
  plan: "oneshot.plan",

  gapFindings: "oneshot.gap_findings",
  resolvedGaps: "oneshot.resolved_gaps",
  gap: "oneshot.gap",
  gapSeedFindings: "oneshot.gap_seed_findings",

  evaluation: "oneshot.evaluation",

  schemaValidation: "oneshot.schema_validation",
  fixtureValidation: "oneshot.fixture_validation",
  goalValidation: "oneshot.goal_validation",
  tripleValidation: "oneshot.triple_validation",

  confirmed: "oneshot.confirmed",
  createdHash: "oneshot.created_hash",
  builderResult: "oneshot.builder_result",
  hashProof: "oneshot.hash_proof",

  rootCause: "oneshot.root_cause",
} as const;

/** Shared run-scoped state passed to every Strands workflow node. */
export class WorkflowRunState {
  private values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  require<T>(key: string): T {
    const value = this.values.get(key);
    if (value === undefined || value === null) {
      throw new Error(`Missing required workflow state: ${key}`);
    }
    return value as T;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  applyDelta(delta: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(delta)) {
      this.values.set(key, value);
    }
  }

  runId(): string {
    return this.require<string>(WORKFLOW_STATE.runId);
  }

  prompt(): Prompt {
    return this.require<Prompt>(WORKFLOW_STATE.prompt);
  }

  bundle(): ResearchBundle {
    return this.require<ResearchBundle>(WORKFLOW_STATE.bundle);
  }

  audit(): Audit {
    return this.require<Audit>(WORKFLOW_STATE.audit);
  }

  plan(): Plan {
    return this.require<Plan>(WORKFLOW_STATE.plan);
  }

  gapFindings(): GapFinding[] {
    return this.get<GapFinding[]>(WORKFLOW_STATE.gapFindings) ?? [];
  }

  resolvedGaps(): GapAnalysis["resolved_gaps"] {
    return (
      this.get<GapAnalysis["resolved_gaps"]>(WORKFLOW_STATE.resolvedGaps) ?? []
    );
  }

  gap(): GapAnalysis {
    return this.require<GapAnalysis>(WORKFLOW_STATE.gap);
  }

  evaluation(): Evaluation {
    return this.require<Evaluation>(WORKFLOW_STATE.evaluation);
  }

  schemaValidation(): SchemaValidationResult {
    return this.require<SchemaValidationResult>(WORKFLOW_STATE.schemaValidation);
  }

  fixtureValidation(): FixtureValidationResult {
    return this.require<FixtureValidationResult>(
      WORKFLOW_STATE.fixtureValidation,
    );
  }

  goalValidation(): GoalValidationResult {
    return this.require<GoalValidationResult>(WORKFLOW_STATE.goalValidation);
  }

  tripleValidation(): TripleValidation {
    return this.require<TripleValidation>(WORKFLOW_STATE.tripleValidation);
  }

  confirmed(): ConfirmedPackage {
    return this.require<ConfirmedPackage>(WORKFLOW_STATE.confirmed);
  }

  createdHash(): string {
    return this.require<string>(WORKFLOW_STATE.createdHash);
  }

  builderResult(): SandboxExecutionResult {
    return this.require<SandboxExecutionResult>(WORKFLOW_STATE.builderResult);
  }

  hashProof(): HashProof {
    return this.require<HashProof>(WORKFLOW_STATE.hashProof);
  }

  rootCause(): RootCause | undefined {
    return this.get<RootCause>(WORKFLOW_STATE.rootCause);
  }
}

/** Effects the canonical workflow uses to touch durable runtime state. */
export interface WorkflowEffects {
  event(
    runId: string,
    processor: string,
    state: "Pending" | "Running" | "Completed" | "Failed",
    data?: Record<string, unknown>,
  ): void;
  save(runId: string, name: string, value: unknown): Promise<string>;
  review(runId: string, research: ResearchBundle): Promise<ResearchBundle>;
  buildReview(
    runId: string,
    confirmed: ConfirmedPackage,
    hash: string,
  ): Promise<void>;
  finishPassed(runId: string, proof: HashProof): void;
  finishRoot(
    runId: string,
    rootCause: RootCause,
    proof?: HashProof,
  ): void;
}

export function rootCauseDelta(rootCause: RootCause): Record<string, unknown> {
  return { [WORKFLOW_STATE.rootCause]: rootCause };
}

/** OneShot job ids must contain at least one non-numeric character. */
export function requireJobId(jobId: string, stage: string): string {
  if (!jobId || !/[A-Za-z]/.test(jobId)) {
    throw new Error(
      `${stage} job_id must contain at least one non-numeric character`,
    );
  }
  return jobId;
}

/** Deterministic signature of the current validation misses. */
export function validationSignature(triple: TripleValidation): string {
  const fixture = triple.fixture_validation.assertion_results
    .filter((result) => !result.satisfied)
    .map((result) => result.assertion_id)
    .sort()
    .join(",");
  const goal = triple.goal_validation.criterion_results
    .filter((result) => !result.satisfied)
    .map((result) => result.criterion_id)
    .sort()
    .join(",");
  return [
    triple.schema_validation.result,
    triple.fixture_validation.result,
    triple.goal_validation.result,
    fixture,
    goal,
  ].join("|");
}
