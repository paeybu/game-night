import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Below Vercel's 4.5 MB request body limit — this upload passes through the
// function, unlike guest photos which go straight to Supabase Storage.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const code = String(form.get("code") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const file = form.get("photo");

  const session = await getAdminSession(code);
  if (!session) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 401 });

  if (!name) return NextResponse.json({ error: "กรุณาใส่ชื่อ" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "กรุณาเลือกรูป" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "ไฟล์ต้องเป็นรูปภาพ" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "รูปต้องมีขนาดไม่เกิน 4 MB" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${session.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await db.storage
    .from("candidates")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { count } = await db
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);

  const { data, error } = await db
    .from("candidates")
    .insert({ session_id: session.id, name, photo_path: path, sort_order: count ?? 0 })
    .select("*")
    .single();

  if (error) {
    await db.storage.from("candidates").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidate: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "";
  const id = searchParams.get("id") ?? "";

  const session = await getAdminSession(code);
  if (!session) return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึง" }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("candidates")
    .delete()
    .eq("id", id)
    .eq("session_id", session.id)
    .select("photo_path")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.photo_path) await db.storage.from("candidates").remove([data.photo_path]);

  return NextResponse.json({ ok: true });
}
