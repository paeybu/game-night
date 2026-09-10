import "server-only";

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Session } from "@/lib/types";

export const adminCookieName = (code: string) => `admin_${code}`;

export async function getSessionByCode(code: string): Promise<Session | null> {
  const { data } = await supabaseAdmin()
    .from("sessions")
    .select("*")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return (data as Session | null) ?? null;
}

/**
 * Returns the session when the caller holds the matching `admin_<code>` cookie,
 * otherwise null. Used by the admin page and every admin API route.
 */
export async function getAdminSession(code: string): Promise<Session | null> {
  const token = (await cookies()).get(adminCookieName(code.toUpperCase()))?.value;
  if (!token) return null;

  const session = await getSessionByCode(code);
  if (!session) return null;

  const { data } = await supabaseAdmin()
    .from("session_admins")
    .select("session_id")
    .eq("session_id", session.id)
    .eq("admin_token", token)
    .maybeSingle();

  return data ? session : null;
}
