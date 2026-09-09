import type {
  FixtureValidationResult,
  GoalValidationResult,
  Plan,
  ResearchBundle,
  SchemaValidationResult,
  TripleValidation,
} from "../contracts/schema/types.js";
import { ValidationLanePool } from "./validation-lane-pool.js";

/**
 * TypeScript adapter over deterministic Python proof logic.
 *
 * The canonical Strands path runs Schema / Fixture / Goal through three dedicated
 * Python worker lanes so ParallelAgent fan-out is real execution concurrency,
 * not three TypeScript promises queued behind one synchronous Python worker.
 */
export class DeterministicValidationRuntime {
  constructor(private lanes: ValidationLanePool) {}

  private payload(bundle: ResearchBundle, plan: Plan) {
    return {
      plan,
      validation: bundle.validation,
      schema_artifact: bundle.schema_artifact,
      fixture: bundle.fixture,
      goal: bundle.goal,
    };
  }

  /** Validate Researcher-owned routing once before validator fan-out. */
  async assertRouting(bundle: ResearchBundle, plan: Plan): Promise<void> {
    await this.lanes.schema.call("triple-routing", this.payload(bundle, plan));
  }

  async schema(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<SchemaValidationResult> {
    return await this.lanes.schema.call<SchemaValidationResult>(
      "schema-validation",
      this.payload(bundle, plan),
    );
  }

  async fixture(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<FixtureValidationResult> {
    return await this.lanes.fixture.call<FixtureValidationResult>(
      "fixture-validation",
      this.payload(bundle, plan),
    );
  }

  async goal(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<GoalValidationResult> {
    return await this.lanes.goal.call<GoalValidationResult>(
      "goal-validation",
      this.payload(bundle, plan),
    );
  }

  /** Compatibility path for direct callers outside the canonical Strands runtime. */
  async triple(bundle: ResearchBundle, plan: Plan): Promise<TripleValidation> {
    await this.assertRouting(bundle, plan);
    const [schemaValidation, fixtureValidation, goalValidation] =
      await Promise.all([
        this.schema(bundle, plan),
        this.fixture(bundle, plan),
        this.goal(bundle, plan),
      ]);

    return {
      plan_id: plan.plan_id,
      validation_id: bundle.validation.validation_id,
      schema_validation: schemaValidation,
      fixture_validation: fixtureValidation,
      goal_validation: goalValidation,
      all_valid: [schemaValidation, fixtureValidation, goalValidation].every(
        (result) => result.result === "Passed",
      ),
    };
  }

  close(): void {
    this.lanes.close();
  }
}
