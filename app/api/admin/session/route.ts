import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { DisplayMode } from "@/lib/types";

const DISPLAY_MODES: DisplayMode[] = ["feed", "vote", "results"];

type Patch = {
  code?: string;
  display_mode?: DisplayMode;
  voting_open?: boolean;
  display_ms?: number;
};

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as Patch;
  const session = await getAdminSession(body.code ?? "");
  if (!session) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 401 });

  const update: Record<string, unknown> = {};

  if (body.display_mode !== undefined) {
    if (!DISPLAY_MODES.includes(body.display_mode)) {
      return NextResponse.json({ error: "โหมดการแสดงผลไม่ถูกต้อง" }, { status: 400 });
    }
    update.display_mode = body.display_mode;
  }

  if (body.voting_open !== undefined) {
    update.voting_open = Boolean(body.voting_open);
  }

  if (body.display_ms !== undefined) {
    const ms = Number(body.display_ms);
    if (!Number.isFinite(ms) || ms < 1000 || ms > 600000) {
      return NextResponse.json(
        { error: "ระยะเวลาต้องอยู่ระหว่าง 1 ถึง 600 วินาที" },
        { status: 400 },
      );
    }
    update.display_ms = Math.round(ms);
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "ไม่มีข้อมูลให้อัปเดต" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("sessions")
    .update(update)
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data });
}
