import type {
  FixtureValidationResult,
  GoalValidationResult,
  Plan,
  ResearchBundle,
  SchemaValidationResult,
  TripleValidation,
} from "../contracts/schema/types.js";
import { CanonicalContractSkill } from "../skills/canonical-contract-skill.js";
import { DeterministicValidationRuntime } from "../validation/deterministic-validation.js";

/** Deterministic Triple Validation operations used by the Strands workflow. */
export class TripleValidationWorkflow {
  constructor(
    private validation: DeterministicValidationRuntime,
    private contracts: CanonicalContractSkill,
  ) {}

  async assertRouting(bundle: ResearchBundle, plan: Plan): Promise<void> {
    await this.validation.assertRouting(bundle, plan);
  }

  async schema(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<SchemaValidationResult> {
    const out = await this.validation.schema(bundle, plan);
    await this.contracts.validate(
      "urn:oneshot:schema:schema-validation:2",
      out,
    );
    return out;
  }

  async fixture(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<FixtureValidationResult> {
    const out = await this.validation.fixture(bundle, plan);
    await this.contracts.validate(
      "urn:oneshot:schema:fixture-validation:2",
      out,
    );
    return out;
  }

  async goal(
    bundle: ResearchBundle,
    plan: Plan,
  ): Promise<GoalValidationResult> {
    const out = await this.validation.goal(bundle, plan);
    await this.contracts.validate("urn:oneshot:schema:goal-validation:2", out);
    return out;
  }

  async join(
    bundle: ResearchBundle,
    plan: Plan,
    schemaValidation: SchemaValidationResult,
    fixtureValidation: FixtureValidationResult,
    goalValidation: GoalValidationResult,
  ): Promise<TripleValidation> {
    const mismatches: string[] = [];

    if (schemaValidation.plan_id !== plan.plan_id) {
      mismatches.push(
        `schema plan_id ${schemaValidation.plan_id} != ${plan.plan_id}`,
      );
    }
    if (fixtureValidation.plan_id !== plan.plan_id) {
      mismatches.push(
        `fixture plan_id ${fixtureValidation.plan_id} != ${plan.plan_id}`,
      );
    }
    if (goalValidation.plan_id !== plan.plan_id) {
      mismatches.push(
        `goal plan_id ${goalValidation.plan_id} != ${plan.plan_id}`,
      );
    }
    if (schemaValidation.schema_id !== bundle.schema_artifact.schema_id) {
      mismatches.push(
        `schema_id ${schemaValidation.schema_id} != ${bundle.schema_artifact.schema_id}`,
      );
    }
    if (fixtureValidation.fixture_id !== bundle.fixture.fixture_id) {
      mismatches.push(
        `fixture_id ${fixtureValidation.fixture_id} != ${bundle.fixture.fixture_id}`,
      );
    }
    if (goalValidation.goal_id !== bundle.goal.goal_id) {
      mismatches.push(
        `goal_id ${goalValidation.goal_id} != ${bundle.goal.goal_id}`,
      );
    }
    if (mismatches.length > 0) {
      throw new Error(
        `Triple Validation join mismatch: ${mismatches.join("; ")}`,
      );
    }

    const triple: TripleValidation = {
      plan_id: plan.plan_id,
      validation_id: bundle.validation.validation_id,
      schema_validation: schemaValidation,
      fixture_validation: fixtureValidation,
      goal_validation: goalValidation,
      all_valid: [schemaValidation, fixtureValidation, goalValidation].every(
        (result) => result.result === "Passed",
      ),
    };

    await this.contracts.validate(
      "urn:oneshot:schema:triple-validation:2",
      triple,
    );
    return triple;
  }

  /** Compatibility path for direct callers outside the canonical Strands runtime. */
  async run(bundle: ResearchBundle, plan: Plan): Promise<TripleValidation> {
    await this.assertRouting(bundle, plan);
    const [schemaValidation, fixtureValidation, goalValidation] =
      await Promise.all([
        this.schema(bundle, plan),
        this.fixture(bundle, plan),
        this.goal(bundle, plan),
      ]);
    return await this.join(
      bundle,
      plan,
      schemaValidation,
      fixtureValidation,
      goalValidation,
    );
  }
}
