import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync(
  new URL("../../supabase/migrations/20260925061327_datanest_project_member_invitations_v1.sql",import.meta.url),
  "utf8"
);
const revokedInviteCleanupMigration=readFileSync(
  new URL("../../supabase/migrations/20260929242500_delete_revoked_project_member_invites.sql",import.meta.url),
  "utf8"
);
const passwordEdge=readFileSync(
  new URL("../../supabase/functions/manage-user-password/index.ts",import.meta.url),
  "utf8"
);
const edge=readFileSync(
  new URL("../../supabase/functions/send-project-member-invite/index.ts",import.meta.url),
  "utf8"
);
const panel=readFileSync(
  new URL("../../src/components/ProjectMembersPanel.tsx",import.meta.url),
  "utf8"
);
const app=readFileSync(
  new URL("../../src/components/DataNestApp.tsx",import.meta.url),
  "utf8"
);
const governance=readFileSync(
  new URL("../../src/components/GovernanceWorkspace.tsx",import.meta.url),
  "utf8"
);

test("project membership is exposed inside Governance",()=>{
  assert.match(governance,/ProjectMembersPanel/);
  assert.match(panel,/FORMAL MEMBERSHIP/);
  assert.match(panel,/Project members \+ governance voters/);
  assert.match(panel,/Sending an invitation never creates an independent vote by itself/);
});

test("project invitations require authenticated acceptance before project access",()=>{
  assert.match(app,/accept_pending_project_member_invites_v1/);
  const loadCoreStart=app.indexOf("const loadCore=useCallback");
  const loadCoreEnd=app.indexOf("const loadJobsPage",loadCoreStart);
  const loadCore=app.slice(loadCoreStart,loadCoreEnd);
  assert.ok(
    loadCore.indexOf("accept_pending_project_member_invites_v1")
      < loadCore.indexOf('.from("projects")'),
    "project invite acceptance must run before project visibility is evaluated"
  );
  assert.match(migration,/pm\.status\s*=\s*'active'/);
  assert.match(migration,/lower\(email\)=caller_email/);
  assert.match(migration,/expires_at>now\(\)/);
});

test("invite gateway prevents self-invite and role escalation",()=>{
  assert.match(edge,/You cannot invite yourself as an independent project member/);
  assert.match(edge,/Only the project owner may invite another admin/);
  assert.match(edge,/Owner or admin access is required to invite project members/);
  assert.match(edge,/\["admin", "operator", "viewer"\]/);
  assert.doesNotMatch(edge,/role.*owner/);
  assert.match(migration,/A stakeholder cannot invite themselves as an independent project member/);
  assert.match(migration,/target_role not in \('admin','operator','viewer'\)/);
});

test("pending and revoked invites are not formal voters",()=>{
  assert.match(migration,/'formal_voting_eligible_before_acceptance',false/);
  assert.match(migration,/'formal_voting_eligible',true/);
  assert.match(migration,/'formal_voting_eligible',false/);
  assert.match(migration,/'invited_member_can_vote',false/);
  assert.match(panel,/Voting remains disabled until that person/);
});

test("invite writes use governed gateways instead of client table mutation",()=>{
  assert.match(panel,/send-project-member-invite/);
  assert.match(panel,/revoke_project_member_invite_v1/);
  assert.match(panel,/get_project_membership_workspace_v1/);
  assert.doesNotMatch(panel,/\.from\("project_members"\)\.(insert|update|delete)/);
  assert.doesNotMatch(panel,/\.from\("project_member_invitations"\)\.(insert|update|delete)/);
});

test("project invite Edge Function requires JWT and service-role mediation",()=>{
  assert.match(edge,/callerClient\.auth\.getUser\(\)/);
  assert.match(edge,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge,/service_register_project_member_invite_v1/);
  assert.match(edge,/service_resolve_project_invite_user_v1/);
  assert.match(edge,/inviteUserByEmail/);
  assert.match(edge,/admin\.getUserById/);
  assert.match(edge,/email_confirmed_at/);
  assert.match(edge,/resetPasswordForEmail/);
  assert.doesNotMatch(edge,/signInWithOtp/);
});


test("project invite action reports sending, success and failure inline",()=>{
  assert.match(panel,/type InviteState="idle"\|"sending"\|"sent"\|"failed"/);
  assert.match(panel,/Sending invite…/);
  assert.match(panel,/Invite sent/);
  assert.match(panel,/Invite failed · Retry/);
  assert.match(panel,/aria-live="polite"/);
  assert.match(panel,/delivery==="recovery"/);
  assert.doesNotMatch(panel,/delivery==="magic-link"/);
});


test("project membership UI blocks active duplicates and distinguishes pending resend",()=>{
  assert.match(panel,/useMemo/);
  assert.match(panel,/normalizeEmail/);
  assert.match(panel,/matchingMember/);
  assert.match(panel,/matchingPendingInvite/);
  assert.match(panel,/memberAlreadyActive/);
  assert.match(panel,/Already active/);
  assert.match(panel,/Invitation already pending/);
  assert.match(panel,/Resend project invite/);
  assert.match(panel,/resendInvite/);
});

test("project membership UI keeps compact responsive row metadata",()=>{
  assert.match(panel,/shortId/);
  assert.match(panel,/membershipIdentity/);
  assert.match(panel,/data-label="Member"/);
  assert.match(panel,/data-label="Invitee"/);
  assert.match(panel,/data-label="Action"/);
});


test("membership table exposes governed password controls",()=>{
  assert.match(panel,/data-label="Password"/);
  assert.match(panel,/Email reset/);
  assert.match(panel,/Set temporary/);
  assert.match(panel,/manage-user-password/);
  assert.match(panel,/canManagePassword/);
  assert.match(passwordEdge,/callerClient\.auth\.getUser\(\)/);
  assert.match(passwordEdge,/service\.auth\.admin\.updateUserById/);
  assert.match(passwordEdge,/emailClient\.auth\.resetPasswordForEmail/);
  assert.match(passwordEdge,/Admins cannot change owner or admin account passwords/);
});

test("revoked invitations can be deleted only through an audited governed RPC",()=>{
  assert.match(revokedInviteCleanupMigration,/delete_revoked_project_member_invite_v1/);
  assert.match(revokedInviteCleanupMigration,/invite_row\.status<>'revoked'/);
  assert.match(revokedInviteCleanupMigration,/Only the project owner may delete a revoked admin invitation/);
  assert.match(revokedInviteCleanupMigration,/PROJECT_MEMBER_REVOKED_INVITE_DELETED/);
  assert.ok(
    revokedInviteCleanupMigration.indexOf("insert into public.events")
      < revokedInviteCleanupMigration.indexOf("delete from public.project_member_invitations"),
    "deletion evidence must be written before the revoked invitation row is removed"
  );
  assert.match(panel,/delete_revoked_project_member_invite_v1/);
  assert.match(panel,/invite\.status==="revoked"/);
  assert.match(panel,/Confirm delete/);
  assert.match(panel,/governance event history/);
});


test("project invitation registration precedes any email delivery side effect",()=>{
  const registrationIndex=edge.indexOf("service_register_project_member_invite_v1");
  const inviteEmailIndex=edge.indexOf("service.auth.admin.inviteUserByEmail");
  const recoveryEmailIndex=edge.indexOf("emailClient.auth.resetPasswordForEmail");

  assert.ok(registrationIndex>=0,"durable invitation registration must exist");
  assert.ok(inviteEmailIndex<0 || registrationIndex<inviteEmailIndex,"invitation email must follow durable registration");
  assert.ok(recoveryEmailIndex<0 || registrationIndex<recoveryEmailIndex,"recovery email must follow durable registration");

  assert.match(edge,/admin\.createUser\(\{[\s\S]*?email_confirm:\s*false/);
  assert.match(edge,/retryable:\s*true/);
  assert.match(edge,/Project invitation was registered, but email delivery failed/);
});
