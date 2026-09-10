import { NextResponse, type NextRequest } from "next/server";
import { getSessionByCode } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Submission } from "@/lib/types";

/**
 * Finishes the item on screen and claims the next one.
 *
 * Runs server-side with the service role so `advance_queue` no longer has to
 * be executable by anon, and so the photo that just finished can be deleted
 * from storage the moment it leaves the screen — it has been seen, there is
 * no reason to keep paying for it.
 *
 * Deliberately unauthenticated beyond a valid session code: any device
 * showing the display needs to call it. The blast radius is limited to
 * skipping the current item, and photos are only ever deleted after they
 * have been shown.
 */
export async function POST(request: NextRequest) {
  const { code } = (await request.json()) as { code?: string };

  const session = await getSessionByCode(code ?? "");
  if (!session) return NextResponse.json({ error: "ไม่พบห้องนี้" }, { status: 404 });

  const db = supabaseAdmin();

  // Capture what is on screen before advance_queue marks it done.
  const { data: finishing } = await db
    .from("submissions")
    .select("id, photo_path")
    .eq("session_id", session.id)
    .eq("status", "showing")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db.rpc("advance_queue", { sid: session.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // An empty queue makes the function return a NULL composite, which arrives
  // as an all-null object rather than JSON null. Left as-is the display would
  // treat it as a real item and stall on a blank screen instead of the QR.
  const next = data as Submission | null;
  const advanced = next?.id !== finishing?.id;

  const previous = finishing as { id: string; photo_path: string | null } | null;
  // `advance_queue` hands back the same item when it still has time on screen
  // (a second display, a retry). Deleting its photo then would blank a photo
  // mid-show.
  if (advanced && previous?.photo_path) {
    // Best effort: a failed delete costs storage, a thrown error costs the
    // display its next item.
    const { error: removeError } = await db.storage
      .from("photos")
      .remove([previous.photo_path]);

    if (!removeError) {
      // Null the column too, so nothing renders a dead URL later.
      await db.from("submissions").update({ photo_path: null }).eq("id", previous.id);
    }
  }

  return NextResponse.json({ submission: next?.id ? next : null });
}
