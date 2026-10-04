import type { PortfolioRole } from "@/lib/portfolioRegistry";

export type AuditSeverity="info"|"low"|"medium"|"high"|"critical";
export type AuditFindingState="draft"|"observation"|"potential_gap"|"verified_nonconformity"|"accepted"|"rejected";
export type AuditClaimKind="observed"|"inferred"|"unknown";
export type AuditSourceState="pending"|"captured"|"blocked"|"failed"|"stale";
export type DocumentKind="audit_plan"|"applicability_matrix"|"evidence_register"|"trace_matrix"|"findings_actions"|"review_log"|"assessment_report";

export type StandardRef={id:string;edition:string;title:string;issuer:"ISO";url:string;domains:string[];kind:"requirements"|"guidance"|"quality_model";statusCheckedAt:string};
export type StandardsProfileInput={selected:Array<{standardId:string;edition:string;applicability:string;licensedClauseRef?:string}>;excluded:Array<{standardId:string;reason:string}>;reviewerId?:string|null;approvedAt?:string|null;version?:number};
export type StandardsProfile={selected:Array<{standardId:string;edition:string;applicability:string;licensedClauseRef?:string}>;excluded:Array<{standardId:string;reason:string}>;reviewerId:string|null;approvedAt:string|null;version:number};

export type ExternalAuditSource={id:string;assessment_id:string;revision:number;kind:string;canonical_reference:string;source_version:string|null;fetched_at:string|null;content_hash:string|null;locator:string|null;visibility:string;acquisition_state:AuditSourceState;coverage_note:string|null};
export type ExternalAuditFinding={id:string;assessment_id:string;revision:number;criterion_id:string;evidence_ids:string[];observation:string;limitation:string|null;claim_kind:AuditClaimKind;severity:AuditSeverity;confidence:number;state:AuditFindingState;draft_action:string|null};
export type ExternalAuditAction={id:string;finding_id:string;outcome:string;acceptance:string|null;priority:number;status:string;job_id:string|null};
export type ExternalAuditEvent={id:string;assessment_id:string;revision:number;event_type:string;actor_user_id:string|null;payload:Record<string,unknown>;created_at:string};
export type ExternalAuditDocument={id:string;assessment_id:string;revision:number;kind:DocumentKind;format:"html"|"csv"|"json"|"pdf";content_hash:string;content_text:string;storage_reference:string|null;visibility:string;generated_at:string};
export type ExternalAssessment={id:string;project_id:string;target_name:string;target_kind:string;target_goal:string|null;target_reference:string|null;status:string;revision:number;created_at:string;updated_at:string};
export type AssessmentBundle={assessment:ExternalAssessment;profile:StandardsProfile|null;sources:ExternalAuditSource[];findings:ExternalAuditFinding[];actions:ExternalAuditAction[];events:ExternalAuditEvent[];documents:ExternalAuditDocument[]};
export type ExternalAuditorProps={projectId:string;currentUserId:string;role:PortfolioRole};
