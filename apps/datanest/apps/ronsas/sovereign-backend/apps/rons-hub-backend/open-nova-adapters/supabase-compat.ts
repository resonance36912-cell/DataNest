// RONS provider-neutral compatibility contract.
// Server-side only: browser traffic must use the Hub same-origin proxy.

export const sovereignCompatibility = {
  provider: "rons-sovereign",
  networkScope: "loopback_only",
  gateway: "http://127.0.0.1:58600",
  database: {
    query: "/v1/db/query",
    procedure: "/v1/db/procedure",
    allowlistedProcedures: ["transaction_probe", "mirror_user_roles", "read_subscription_mirror", "read_subscription_account", "mirror_subscriptions", "read_account_invoices", "read_admin_invoices", "read_billing_account", "read_billing_admin", "record_payfast_launch", "record_payfast_itn_attempt", "settle_payfast_itn", "record_cost_usage", "read_cost_usage_summary", "nova_transition_job", "datanest_approve_memory", "datanest_supersede_memory", "governance_list_participants", "governance_list_proposals", "governance_get_proposal", "governance_create_proposal", "governance_submit_proposal", "governance_add_evidence", "governance_add_review", "governance_record_decision", "governance_register_agent"],
    protectedReads: ["invoices", "credit_wallets", "credit_ledger", "billing_receipts"],
    protectedAudits: ["payfast_launch_logs", "payfast_itn_logs", "webhook_events", "plan_changes", "subscription_email_sends", "email_suppression_list", "cost_usage_events"],
    stagedProcedures: ["create_admin_bootstrap_challenge", "cancel_admin_bootstrap_challenge", "bootstrap_first_admin"],
    stagedBootstrapEnableEnv: "RONS_BOOTSTRAP_PROCEDURES_ENABLED",
    stagedBootstrapDefault: false,
    protectedWrites: ["user_roles", "subscriptions", "invoices", "billing_receipts", "payfast_itn_logs", "webhook_events", "plan_changes", "subscription_email_sends", "email_suppression_list", "cost_usage_events"],
    subscriptionEntitlementColumns: ["app", "tier", "status", "current_period_end"],
    subscriptionEntitlementFilter: "user_id eq UUID",
    subscriptionEntitlementLimitMax: 100,
    procedureAuthHeader: "X-RONS-Procedure-Key",
    procedureSecretRef: "runtime/secrets/gateway-procedure-key",
    arbitrarySql: false,
  },
  auth: {
    session: "/v1/auth/session",
    user: "/v1/auth/user",
    signIn: "/v1/auth/sign-in",
    signUp: "/v1/auth/sign-up",
    signOut: "/v1/auth/sign-out",
    bearerCompatible: true,
  },
  storage: {
    object: "/v1/storage/{bucket}/{path}",
  },
} as const;

export type SovereignCompatibility = typeof sovereignCompatibility;
