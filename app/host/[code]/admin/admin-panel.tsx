"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { publicUrl } from "@/lib/storage";
import type { Candidate, DisplayMode, Session } from "@/lib/types";

const MODES: { mode: DisplayMode; label: string; hint: string }[] = [
  { mode: "feed", label: "ฟีด", hint: "รูปและข้อความ" },
  { mode: "vote", label: "โหวต", hint: "โชว์แค่จำนวนคน" },
  { mode: "results", label: "ผลโหวต", hint: "เปิดเผยคะแนน" },
];

const DURATIONS = [
  { label: "10 วิ", ms: 10000 },
  { label: "30 วิ", ms: 30000 },
  { label: "60 วิ", ms: 60000 },
  { label: "2 นาที", ms: 120000 },
];

export default function AdminPanel({
  session: initialSession,
  initialCandidates,
}: {
  session: Session;
  initialCandidates: Candidate[];
}) {
  const [session, setSession] = useState(initialSession);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  async function patch(update: Partial<Pick<Session, "display_mode" | "voting_open" | "display_ms">>) {
    setError(null);
    const previous = session;
    setSession({ ...session, ...update }); // optimistic — the host screen follows via realtime

    const res = await fetch("/api/admin/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: session.code, ...update }),
    });

    if (!res.ok) {
      setSession(previous);
      setError(((await res.json()) as { error?: string }).error ?? "อัปเดตไม่สำเร็จ");
    }
  }

  async function addCandidate(formData: FormData) {
    setError(null);
    setUploading(true);
    formData.set("code", session.code);

    const res = await fetch("/api/admin/candidates", { method: "POST", body: formData });
    const body = (await res.json()) as { candidate?: Candidate; error?: string };
    setUploading(false);

    if (!res.ok || !body.candidate) {
      setError(body.error ?? "อัปโหลดไม่สำเร็จ");
      return;
    }
    setCandidates((list) => [...list, body.candidate!]);
    formRef.current?.reset();
  }

  async function removeCandidate(id: string) {
    setError(null);
    const res = await fetch(
      `/api/admin/candidates?code=${session.code}&id=${id}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setError(((await res.json()) as { error?: string }).error ?? "ลบไม่สำเร็จ");
      return;
    }
    setCandidates((list) => list.filter((c) => c.id !== id));
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">แอดมิน</h1>
          <p className="font-mono text-sm text-zinc-500">{session.code}</p>
        </div>
        <Link
          href={`/host/${session.code}`}
          className="rounded-full border border-black/10 px-4 py-2 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          ดูหน้าจอ →
        </Link>
      </header>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="space-y-4">
        <h2 className="text-sm font-medium tracking-wider text-zinc-500 uppercase">การแสดงผล</h2>

        <div className="grid grid-cols-3 gap-2">
          {MODES.map(({ mode, label, hint }) => (
            <button
              key={mode}
              onClick={() => startTransition(() => void patch({ display_mode: mode }))}
              className={`rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                session.display_mode === mode
                  ? "border-transparent bg-foreground text-background"
                  : "border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              }`}
            >
              <span className="block">{label}</span>
              <span className="block text-[11px] font-normal opacity-60">{hint}</span>
            </button>
          ))}
        </div>

        {session.display_mode === "results" && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            ตอนนี้คะแนนกำลังขึ้นบนจอใหญ่อยู่
          </p>
        )}

        <div className="space-y-2">
          <p className="text-sm text-zinc-500">เวลาต่อหนึ่งรายการ</p>
          <div className="grid grid-cols-4 gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.ms}
                onClick={() => startTransition(() => void patch({ display_ms: d.ms }))}
                className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                  session.display_ms === d.ms
                    ? "border-transparent bg-foreground text-background"
                    : "border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium tracking-wider text-zinc-500 uppercase">การโหวต</h2>
          <button
            onClick={() => startTransition(() => void patch({ voting_open: !session.voting_open }))}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              session.voting_open
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            }`}
          >
            {session.voting_open ? "เปิดโหวตอยู่ — กดเพื่อปิด" : "ปิดโหวตอยู่ — กดเพื่อเปิด"}
          </button>
        </div>

        <form
          ref={formRef}
          action={addCandidate}
          className="space-y-3 rounded-2xl border border-black/10 p-4 dark:border-white/15"
        >
          <input
            name="name"
            placeholder="ชื่อตัวเลือก"
            required
            className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-foreground dark:border-white/20"
          />
          <input
            name="photo"
            type="file"
            accept="image/*"
            required
            className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-4 file:py-2 file:text-sm dark:file:bg-white/10"
          />
          <button
            type="submit"
            disabled={uploading}
            className="w-full rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {uploading ? "กำลังเพิ่ม…" : "เพิ่มตัวเลือก"}
          </button>
        </form>

        {candidates.length > 0 && (
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-black/10 p-2 dark:border-white/15"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl("candidates", c.photo_path)}
                  alt={c.name}
                  className="size-14 rounded-xl object-cover"
                />
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <button
                  onClick={() => void removeCandidate(c.id)}
                  className="rounded-full px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        {pending ? "กำลังบันทึก…" : "การเปลี่ยนแปลงมีผลกับจอทันที"}
      </p>
    </main>
  );
}
