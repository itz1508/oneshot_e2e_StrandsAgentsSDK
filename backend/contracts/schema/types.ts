export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ExecutionStatus = "Pending" | "Running" | "Completed" | "Failed";
export type TestResult = "Passed" | "Failed";
export type IssueType = "Root Cause" | "Missing";
export type PipelineStatus = "Running" | "Done";
export type ProcessingScope = "WORKFLOW" | "SANDBOX" | "SUPPORT";
export interface PromptContext { context_id:string; statement:string }
export interface Prompt { prompt_id:string; intent:string; requested_outcome:string; context:PromptContext[]; research_direction:string[] }
export interface EvidenceRef { evidence_id:string; source:string; statement:string; provenance:string }
export interface RootCause { issue:string; expected:string; actual:string; evidence_ids:string[]; required_correction:string; recheck_target:string }
export interface SuccessDefinition { success_criteria_ids:string[]; success_meaning:string; evidence_ids:string[] }
export interface ResearcherArtifact { researcher_id:string; prompt_id:string; plan_id:string; schema_id:string; fixture_id:string; goal_id:string; validation_id:string; requirement_ids:string[]; evidence:EvidenceRef[]; success_definition:SuccessDefinition }
export interface Requirement { requirement_id:string; statement:string; evidence_ids:string[] }
export interface Dependency { dependency_id:string; description:string; required_by:string[] }
export interface PlanStep { step_id:string; description:string; responsibility:string; depends_on:string[]; requirement_refs:string[]; goal_refs:string[]; fixture_refs:string[]; schema_refs:string[] }
export interface RevisionEvidence { revision:number; affected_area:string; reason:string; audit_finding_id:string }
export interface Plan { plan_id:string; researcher_id:string; requirements:Requirement[]; dependencies:Dependency[]; steps:PlanStep[]; revision:number; revision_evidence:RevisionEvidence[] }
export interface SchemaArtifact { schema_id:string; researcher_id:string; target:string; schema_document:Record<string,JsonValue>; evidence_ids:string[] }
export interface SuccessCriterion { criterion_id:string; statement:string; measurement:string; expected_result:string; evidence_ids:string[] }
export interface Goal { goal_id:string; researcher_id:string; objective:string; success_meaning:string; success_criteria:SuccessCriterion[] }
export type AssertionOperator="exists"|"equals"|"contains"|"matchesSchema"|"references"|"edgeExists"|"allFilesSpecified";
export interface PlanAssertion { assertion_id:string; operator:AssertionOperator; target:string; expected?:JsonValue; evidence_ids:string[] }
export interface Fixture { fixture_id:string; researcher_id:string; plan_assertions:PlanAssertion[] }
export interface ValidationDefinition {
  validation_id:string; researcher_id:string; plan_id:string;
  schema_validation:{plan_id:string;schema_id:string};
  fixture_validation:{plan_id:string;fixture_id:string;assertion_ids:string[]};
  goal_validation:{plan_id:string;goal_id:string;criterion_ids:string[]};
}
export interface AuditFinding { finding_id:string; area:string; finding:string; affected_plan_refs:string[]; evidence_ids:string[]; required_refinement:string }
export interface Audit { audit_id:string; researcher_id:string; plan_id:string; reviewed_areas:string[]; findings:AuditFinding[] }
export interface ResolvedGap { gap_id:string; affected_branch:string; issue:string; evidence_ids:string[]; required_correction:string; expected_resolved_state:string; resolution_evidence:string }
export interface GapAnalysis { plan_id:string; result:TestResult; resolved_gaps:ResolvedGap[]; gap_0:boolean; issue_type?:IssueType; root_cause?:RootCause }
export interface EvaluationEvidence { check_id:string; subject:string; finding:string; evidence_ids:string[] }
export interface Evaluation { plan_id:string; result:TestResult; evidence:EvaluationEvidence[]; issue_type?:IssueType; root_cause?:RootCause }
export interface SchemaValidationResult { plan_id:string; schema_id:string; result:TestResult; evidence:EvidenceRef[] }
export interface AssertionResult { assertion_id:string; expected?:JsonValue; actual?:JsonValue; satisfied:boolean }
export interface FixtureValidationResult { plan_id:string; fixture_id:string; assertion_results:AssertionResult[]; result:TestResult; evidence:EvidenceRef[] }
export interface CriterionResult { criterion_id:string; mapped_plan_refs:string[]; satisfied:boolean }
export interface GoalValidationResult { plan_id:string; goal_id:string; criterion_results:CriterionResult[]; result:TestResult; evidence:EvidenceRef[] }
export interface TripleValidation { plan_id:string; validation_id:string; schema_validation:SchemaValidationResult; fixture_validation:FixtureValidationResult; goal_validation:GoalValidationResult; all_valid:boolean }
export interface ConfirmedCore { researcher:ResearcherArtifact; plan:Plan; schema_artifact:SchemaArtifact; fixture:Fixture; goal:Goal; validation:ValidationDefinition; audit:Audit; gap_analysis:GapAnalysis; evaluation:Evaluation; triple_validation:TripleValidation }
export interface ConfirmedPackage { confirmed:true; core:ConfirmedCore }
export interface HashProof { canonicalization_id:"oneshot-jcs-rfc8785-v1"; algorithm:"sha256"; created_hash:string; recomputed_hash:string; equal:boolean }
export interface ResearchBundle { prompt:Prompt; researcher:ResearcherArtifact; plan:Plan; schema_artifact:SchemaArtifact; fixture:Fixture; goal:Goal; validation:ValidationDefinition }
export interface ProcessingEvent { event_id:string; sequence:number; run_id:string; scope:ProcessingScope; processor:string; execution_status:ExecutionStatus; test_result?:TestResult; issue_type?:IssueType; issue?:RootCause; artifact_id?:string; message?:string; created_at:string; causation_id?:string; correlation_id:string; traceparent:string; artifact?:{ name:string; path:string; operation?:'created'|'updated'|'verified'|'failed'; kind?:'research'|'plan'|'schema'|'fixture'|'validation'|'build'|'evidence'; } }
export interface RunSnapshot { run_id:string; pipeline_status:PipelineStatus; test_result?:TestResult; issue_type?:IssueType; current_processor?:string; events:ProcessingEvent[]; artifacts:Record<string,string>; hash_proof?:HashProof; root_cause?:RootCause; help_request?:import("../../intent/types.js").HelpRequest }
