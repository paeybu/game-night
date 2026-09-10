import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getAdminSession, getSessionByCode } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Candidate } from "@/lib/types";
import AdminPanel from "./admin-panel";

export default async function AdminPage({ params }: PageProps<"/host/[code]/admin">) {
  await connection();

  const { code } = await params;
  if (!(await getSessionByCode(code))) notFound();

  const session = await getAdminSession(code);
  if (!session) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <h1 className="text-2xl font-semibold">ไม่ใช่ห้องของคุณ</h1>
        <p className="max-w-sm text-zinc-500">
          หน้าแอดมินเปิดได้เฉพาะเบราว์เซอร์ที่สร้างห้องนี้เท่านั้น
        </p>
      </main>
    );
  }

  const { data } = await supabaseAdmin()
    .from("candidates")
    .select("*")
    .eq("session_id", session.id)
    .order("sort_order");

  return <AdminPanel session={session} initialCandidates={(data as Candidate[]) ?? []} />;
}
