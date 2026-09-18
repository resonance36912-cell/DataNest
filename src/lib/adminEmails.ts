// Server-side admin authorization helper.
// Roles are stored in the `user_roles` table and enforced via RLS.
// Use `isAdminUser(userId)` to check whether the signed-in user has the admin role.
import { supabase } from "@/integrations/supabase/client";

export async function isAdminUser(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) {
    console.error("isAdminUser check failed", error);
    return false;
  }
  return !!data;
}
