import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily Vercel Cron backstop. Photos are normally deleted the moment they
 * leave the screen (see /api/host/advance); this catches the stragglers —
 * submissions from a session that was abandoned before they were shown.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("submissions")
    .delete()
    .lt("created_at", cutoff)
    .select("photo_path");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const paths = (data ?? [])
    .map((row) => (row as { photo_path: string | null }).photo_path)
    .filter((p): p is string => Boolean(p));

  // Storage removes cap out around 1000 keys per call.
  for (let i = 0; i < paths.length; i += 500) {
    await db.storage.from("photos").remove(paths.slice(i, i + 500));
  }

  return NextResponse.json({ deleted: data?.length ?? 0, photos: paths.length });
}
