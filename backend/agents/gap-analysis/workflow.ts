import type {
  GapAnalysis,
  Plan,
  ResearchBundle,
  ResolvedGap,
  RootCause,
} from "../../contracts/schema/types.js";
import { clone, unique } from "../../core/clone.js";
import {
  detectGaps,
  GAP_REFERENCE_FIELDS,
  type GapFinding,
} from "./tool/coverage.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";

export interface GapFixResult {
  plan: Plan;
  resolved?: ResolvedGap;
  rootCause?: RootCause;
}

/** Deterministic Gap Analysis operations used by the Strands canonical workflow. */
export class GapAnalysisWorkflow {
  constructor(private contracts: CanonicalContractSkill) {}

  inspect(bundle: ResearchBundle, plan: Plan): GapFinding[] {
    return detectGaps(bundle, plan);
  }

  resolveOne(
    bundle: ResearchBundle,
    input: Plan,
    gap: GapFinding,
  ): GapFixResult {
    const plan = clone(input);
    const evidenceIds = gap.evidence_ids?.length
      ? [...gap.evidence_ids]
      : bundle.researcher.evidence.map((e) => e.evidence_id);
    const step = gap.target_step_id
      ? plan.steps.find((s) => s.step_id === gap.target_step_id)
      : undefined;

    if (!step) {
      return {
        plan,
        rootCause: {
          issue: "Gap correction target unresolved",
          expected: `A plan branch for ${gap.key}`,
          actual: "No deterministic target step",
          evidence_ids: evidenceIds,
          required_correction:
            "Provide the missing information required to identify the correct plan branch",
          recheck_target: plan.plan_id,
        },
      };
    }

    const field = GAP_REFERENCE_FIELDS[gap.affected_branch];
    const before = step[field].length;
    step[field] = unique([...step[field], gap.ref_id]);

    if (step[field].length <= before) {
      return {
        plan,
        rootCause: {
          issue: "Gap correction produced no plan improvement",
          expected: `${gap.ref_id} adds new validated value to ${gap.affected_branch} traceability`,
          actual: `${gap.ref_id} was already represented or the proposed correction added no value`,
          evidence_ids: evidenceIds,
          required_correction:
            "Provide additional evidence for a different deterministic improvement",
          recheck_target: plan.plan_id,
        },
      };
    }

    plan.revision = input.revision + 1;
    plan.revision_evidence = [
      ...plan.revision_evidence,
      {
        revision: plan.revision,
        affected_area: gap.affected_branch,
        reason: `Resolve ${gap.source === "validation" ? "validation-discovered " : ""}gap ${gap.key}`,
        audit_finding_id: `gap:${gap.key}`,
      },
    ];

    return {
      plan,
      resolved: {
        gap_id: `gap:${gap.key}`,
        affected_branch: gap.affected_branch,
        issue: `Missing ${gap.key}`,
        evidence_ids: evidenceIds,
        required_correction: `Add ${gap.ref_id} to ${gap.affected_branch} traceability`,
        expected_resolved_state: `${gap.key} is represented in plan steps`,
        resolution_evidence: `${gap.ref_id} added to ${step.step_id}; revision=${plan.revision}`,
      },
    };
  }

  async finalize(
    plan: Plan,
    resolved: ResolvedGap[],
    rootCause?: RootCause,
  ): Promise<GapAnalysis> {
    const gap: GapAnalysis = rootCause
      ? {
          plan_id: plan.plan_id,
          result: "Failed",
          issue_type: "Root Cause",
          resolved_gaps: resolved,
          gap_0: false,
          root_cause: rootCause,
        }
      : {
          plan_id: plan.plan_id,
          result: "Passed",
          resolved_gaps: resolved,
          gap_0: true,
        };

    await this.contracts.validate("urn:oneshot:schema:plan:2", plan);
    await this.contracts.validate("urn:oneshot:schema:gap:2", gap);
    return gap;
  }

  /** Compatibility path for direct callers outside the canonical Strands runtime. */
  async run(
    bundle: ResearchBundle,
    input: Plan,
  ): Promise<{ plan: Plan; gap: GapAnalysis }> {
    let plan = clone(input);
    const resolved: ResolvedGap[] = [];

    for (;;) {
      const found = this.inspect(bundle, plan);
      if (found.length === 0) {
        return { plan, gap: await this.finalize(plan, resolved) };
      }

      const beforeKeys = new Set(found.map((g) => g.key));
      const fixed = this.resolveOne(bundle, plan, found[0]);
      plan = fixed.plan;

      if (fixed.rootCause) {
        return {
          plan,
          gap: await this.finalize(plan, resolved, fixed.rootCause),
        };
      }
      if (fixed.resolved) resolved.push(fixed.resolved);

      const remaining = this.inspect(bundle, plan);
      const afterKeys = new Set(remaining.map((g) => g.key));
      const introducedNewGap = [...afterKeys].some(
        (key) => !beforeKeys.has(key),
      );
      const progressed = afterKeys.size < beforeKeys.size && !introducedNewGap;

      if (!progressed) {
        return {
          plan,
          gap: await this.finalize(plan, resolved, {
            issue: "Gap Analysis violated deterministic progress invariant",
            expected:
              "Each iteration removes at least one existing gap and introduces no new gap key",
            actual: `before=${[...beforeKeys].join(",")}; after=${[
              ...afterKeys,
            ].join(",")}`,
            evidence_ids: bundle.researcher.evidence.map((e) => e.evidence_id),
            required_correction:
              "Correct the deterministic gap target or provide the missing information",
            recheck_target: plan.plan_id,
          }),
        };
      }
    }
  }
}
