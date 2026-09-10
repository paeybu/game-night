"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { publicUrl } from "@/lib/storage";
import { compressImage } from "@/lib/compress";
import { CANDIDATE_PHOTO } from "@/lib/limits";
import { Spinner } from "@/components/spinner";
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
  // Which action is in flight, e.g. "mode:vote" or "del:<id>". One at a time,
  // so a double tap can't race two writes against the same session row.
  const [pending, setPending] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const busy = pending !== null;

  async function patch(
    key: string,
    update: Partial<Pick<Session, "display_mode" | "voting_open" | "display_ms">>,
  ) {
    if (busy) return;
    setError(null);
    setPending(key);

    const previous = session;
    setSession({ ...session, ...update }); // optimistic — the host screen follows via realtime

    try {
      const res = await fetch("/api/admin/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: session.code, ...update }),
      });

      if (!res.ok) {
        setSession(previous);
        setError(((await res.json()) as { error?: string }).error ?? "อัปเดตไม่สำเร็จ");
      }
    } catch {
      setSession(previous);
      setError("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
    } finally {
      setPending(null);
    }
  }

  async function addCandidate(formData: FormData) {
    if (busy) return;
    setError(null);
    formData.set("code", session.code);

    try {
      // Shrink before it leaves the phone: a raw camera photo would otherwise
      // be rejected by the 5 MB cap on the candidates bucket.
      const picked = formData.get("photo");
      if (picked instanceof File && picked.size > 0) {
        setPending("compress");
        formData.set("photo", await compressImage(picked, CANDIDATE_PHOTO));
      }

      setPending("add");
      const res = await fetch("/api/admin/candidates", { method: "POST", body: formData });
      const body = (await res.json()) as { candidate?: Candidate; error?: string };

      if (!res.ok || !body.candidate) {
        setError(body.error ?? "อัปโหลดไม่สำเร็จ");
        return;
      }
      const added = body.candidate;
      setCandidates((list) => [...list, added]);
      formRef.current?.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setPending(null);
    }
  }

  async function removeCandidate(id: string) {
    if (busy) return;
    setError(null);
    setPending(`del:${id}`);

    try {
      const res = await fetch(`/api/admin/candidates?code=${session.code}&id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(((await res.json()) as { error?: string }).error ?? "ลบไม่สำเร็จ");
        return;
      }
      setCandidates((list) => list.filter((c) => c.id !== id));
    } catch {
      setError("ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setPending(null);
    }
  }

  const optionClass = (selected: boolean) =>
    `relative rounded-xl border transition-colors disabled:opacity-50 ${
      selected
        ? "border-transparent bg-foreground text-background"
        : "border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    }`;

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
              onClick={() => void patch(`mode:${mode}`, { display_mode: mode })}
              disabled={busy}
              className={`${optionClass(session.display_mode === mode)} px-3 py-3 text-sm font-medium`}
            >
              <span className="flex items-center justify-center gap-1.5">
                {pending === `mode:${mode}` && <Spinner className="size-3.5" />}
                {label}
              </span>
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
                onClick={() => void patch(`ms:${d.ms}`, { display_ms: d.ms })}
                disabled={busy}
                className={`${optionClass(session.display_ms === d.ms)} px-3 py-2 text-sm`}
              >
                <span className="flex items-center justify-center gap-1.5">
                  {pending === `ms:${d.ms}` && <Spinner className="size-3.5" />}
                  {d.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium tracking-wider text-zinc-500 uppercase">การโหวต</h2>
          <button
            onClick={() => void patch("voting", { voting_open: !session.voting_open })}
            disabled={busy}
            className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              session.voting_open
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "border border-black/10 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            }`}
          >
            {pending === "voting" && <Spinner className="size-3.5" />}
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
            disabled={busy}
            className="w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 outline-none focus:border-foreground disabled:opacity-50 dark:border-white/20"
          />
          <input
            name="photo"
            type="file"
            accept="image/*"
            required
            disabled={busy}
            className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-4 file:py-2 file:text-sm disabled:opacity-50 dark:file:bg-white/10"
          />
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
          >
            {(pending === "add" || pending === "compress") && <Spinner />}
            {pending === "compress"
              ? "กำลังย่อรูป…"
              : pending === "add"
                ? "กำลังเพิ่ม…"
                : "เพิ่มตัวเลือก"}
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
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950/40"
                >
                  {pending === `del:${c.id}` && <Spinner className="size-3.5" />}
                  {pending === `del:${c.id}` ? "กำลังลบ…" : "ลบ"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        {busy ? "กำลังบันทึก…" : "การเปลี่ยนแปลงมีผลกับจอทันที"}
      </p>
    </main>
  );
}
