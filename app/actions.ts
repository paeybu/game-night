"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { customAlphabet } from "nanoid";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { adminCookieName } from "@/lib/session";

// No 0/O/1/I/L — the code gets typed in by hand when the QR fails.
const newCode = customAlphabet("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 6);

export async function createSession() {
  const db = supabaseAdmin();

  let code: string | null = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = newCode();
    const { data } = await db
      .from("sessions")
      .select("id")
      .eq("code", candidate)
      .maybeSingle();
    if (!data) code = candidate;
  }
  if (!code) throw new Error("Could not allocate a session code");

  const { data: session, error } = await db
    .from("sessions")
    .insert({ code })
    .select("id, code")
    .single();
  if (error || !session) throw new Error(error?.message ?? "Could not create session");

  const { data: admin, error: adminError } = await db
    .from("session_admins")
    .insert({ session_id: session.id })
    .select("admin_token")
    .single();
  if (adminError || !admin) throw new Error(adminError?.message ?? "Could not create admin token");

  (await cookies()).set(adminCookieName(session.code), admin.admin_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect(`/host/${session.code}`);
}
