"use client";

import { useCallback, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { usePoll } from "@/lib/hooks";
import { compressImage } from "@/lib/compress";
import { GUEST_PHOTO } from "@/lib/limits";
import { Spinner } from "@/components/spinner";
import type { Session, Submission } from "@/lib/types";

const MAX_TEXT = 240;
// Only matters while this guest has something queued.
const MINE_POLL_MS = 12000;

export default function ShareTab({ session }: { session: Session }) {
  const supabase = supabaseBrowser();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "compressing" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Submission | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = stage !== "idle";
  const storageKey = `submission:${session.id}`;
  // Once it has been shown there is nothing left to track, so stop polling.
  const done = mine?.status === "done";

  const refreshMine = useCallback(
    async (id: string) => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      const row = data as Submission | null;
      setMine(row);

      if (!row || row.status !== "queued") {
        setPosition(null);
        return;
      }

      const { count } = await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("status", "queued")
        .lt("created_at", row.created_at);

      setPosition((count ?? 0) + 1);
    },
    [supabase, session.id],
  );

  // Restore the last submission from this device and track its position.
  // Polling rather than subscribing: a session-wide submissions channel would
  // fan every insert out to all 200 guests at once.
  usePoll(() => {
    const id = localStorage.getItem(storageKey);
    if (id) void refreshMine(id);
  }, done ? null : MINE_POLL_MS);

  function pickFile(next: File | null) {
    setFile(next);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return next ? URL.createObjectURL(next) : null;
    });
  }

  async function submit() {
    if (busy) return;
    if (!text.trim() && !file) {
      setError("ใส่รูปหรือข้อความสักหน่อยนะ");
      return;
    }

    setError(null);
    setStage(file ? "compressing" : "uploading");

    try {
      let photoPath: string | null = null;

      if (file) {
        setStage("compressing");
        const compressed = await compressImage(file, GUEST_PHOTO);

        setStage("uploading");
        photoPath = `${session.id}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(photoPath, compressed, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
      }

      const { data, error: insertError } = await supabase
        .from("submissions")
        .insert({
          session_id: session.id,
          text: text.trim() || null,
          photo_path: photoPath,
          status: "queued",
        })
        .select("*")
        .single();
      if (insertError) throw new Error(insertError.message);

      localStorage.setItem(storageKey, (data as Submission).id);
      setMine(data as Submission);
      void refreshMine((data as Submission).id);
      setText("");
      pickFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setStage("idle");
    }
  }

  return (
    <div className="space-y-5">
      {mine && <StatusCard submission={mine} position={position} />}

      <label className="block">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
          disabled={busy}
          rows={3}
          placeholder="พิมพ์อะไรสักอย่าง…"
          className="w-full resize-none rounded-2xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none focus:border-foreground dark:border-white/20"
        />
        <span className="float-right text-xs text-zinc-500">
          {text.length}/{MAX_TEXT}
        </span>
      </label>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="w-full rounded-2xl object-cover" />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        disabled={busy}
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-zinc-500 file:mr-3 file:rounded-full file:border-0 file:bg-black/5 file:px-4 file:py-2.5 file:text-sm dark:file:bg-white/10"
      />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={() => void submit()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-4 text-base font-medium text-background transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        {busy && <Spinner className="size-5" />}
        {stage === "compressing" ? "กำลังย่อรูป…" : stage === "uploading" ? "กำลังส่ง…" : "ส่งขึ้นจอ"}
      </button>
    </div>
  );
}

function StatusCard({
  submission,
  position,
}: {
  submission: Submission;
  position: number | null;
}) {
  const label =
    submission.status === "showing"
      ? "กำลังขึ้นจออยู่"
      : submission.status === "done"
        ? "ขึ้นจอไปแล้ว — ส่งใหม่ได้เลย"
        : position === null
          ? "อยู่ในคิว"
          : position === 1
            ? "คิวถัดไปคือคุณ"
            : `คิวที่ ${position}`;

  const tone =
    submission.status === "showing"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
      : "bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300";

  return <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${tone}`}>{label}</div>;
}
