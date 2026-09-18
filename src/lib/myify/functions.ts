import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CreatePackageInput,
  RegisterRouterInput,
  ReleaseAllocationInput,
  ReserveAllocationInput,
  SettleAllocationInput,
} from "@/lib/myify/contracts";

// MYIFY lands with its schema migration. Generated Supabase types are refreshed
// by the normal RONSAS schema-generation workflow after governed promotion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function myifyDb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureDataNest(db: any, userId: string) {
  const { data, error } = await db.rpc("myify_get_or_create_datanest", {
    _actor_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export const getMyifyDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await myifyDb();
    const nest = await ensureDataNest(db, context.userId);

    const [packages, routers, allocations, ledger] = await Promise.all([
      db
        .from("myify_data_packages")
        .select("*")
        .eq("owner_user_id", context.userId)
        .order("expires_at", { ascending: true })
        .limit(100),
      db
        .from("myify_router_mirrors")
        .select("*")
        .eq("owner_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("myify_allocations")
        .select("*")
        .eq("owner_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("myify_interest_ledger")
        .select("*")
        .eq("owner_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    for (const result of [packages, routers, allocations, ledger]) {
      if (result.error) throw new Error(result.error.message);
    }

    return {
      nest,
      packages: packages.data ?? [],
      routers: routers.data ?? [],
      allocations: allocations.data ?? [],
      ledger: ledger.data ?? [],
    };
  });

export const createMyifyPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CreatePackageInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = await myifyDb();
    const nest = await ensureDataNest(db, context.userId);

    const { data: item, error } = await db
      .from("myify_data_packages")
      .insert({
        datanest_id: nest.id,
        owner_user_id: context.userId,
        carrier: data.carrier,
        package_label: data.package_label,
        total_mb: data.total_mb,
        remaining_mb: data.remaining_mb,
        expires_at: data.expires_at,
        rollover_eligible: data.rollover_eligible,
        transferable: data.transferable,
        router_share_permitted: data.router_share_permitted,
        status: "active",
        metadata: {
          source: "manual",
          verification: "unverified",
        },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { package: item };
  });

export const registerMyifyRouter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RegisterRouterInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = await myifyDb();
    const { data: router, error } = await db
      .from("myify_router_mirrors")
      .insert({
        owner_user_id: context.userId,
        label: data.label,
        mode: data.mode,
        local_fingerprint: data.local_fingerprint ?? null,
        status: data.mode === "simulation" ? "ready" : "offline",
        capabilities: {
          allocation_control: data.mode === "simulation" ? "simulated" : "adapter_required",
          secrets_stored: false,
        },
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { router };
  });

export const reserveMyifyAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReserveAllocationInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = await myifyDb();
    const { data: allocation, error } = await db.rpc("myify_reserve_allocation", {
      _actor_user_id: context.userId,
      _package_id: data.package_id,
      _router_id: data.router_id,
      _reserve_mb: data.reserve_mb,
      _intent: data.intent,
    });

    if (error) throw new Error(error.message);
    return { allocation };
  });

export const settleMyifyAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettleAllocationInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = await myifyDb();
    const { data: allocation, error } = await db.rpc("myify_settle_allocation", {
      _actor_user_id: context.userId,
      _allocation_id: data.allocation_id,
      _settle_mb: data.settle_mb,
    });

    if (error) throw new Error(error.message);
    return { allocation };
  });

export const releaseMyifyAllocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReleaseAllocationInput.parse(input))
  .handler(async ({ data, context }) => {
    const db = await myifyDb();
    const { data: allocation, error } = await db.rpc("myify_release_allocation", {
      _actor_user_id: context.userId,
      _allocation_id: data.allocation_id,
    });

    if (error) throw new Error(error.message);
    return { allocation };
  });
