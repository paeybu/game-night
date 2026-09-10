"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useVoterId } from "@/lib/hooks";
import { publicUrl } from "@/lib/storage";
import { Spinner } from "@/components/spinner";
import type { Candidate, Session } from "@/lib/types";

export default function VoteTab({ session }: { session: Session }) {
  const supabase = supabaseBrowser();
  const voterId = useVoterId();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [choice, setChoice] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    const { data } = await supabase
      .from("candidates")
      .select("*")
      .eq("session_id", session.id)
      .order("sort_order");
    setCandidates((data as Candidate[] | null) ?? []);
  }, [supabase, session.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`candidates:${session.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates", filter: `session_id=eq.${session.id}` },
        () => void loadCandidates(),
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void loadCandidates();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, session.id, loadCandidates]);

  useEffect(() => {
    if (!voterId) return;
    void (async () => {
      const { data } = await supabase
        .from("votes")
        .select("candidate_id")
        .eq("session_id", session.id)
        .eq("voter_id", voterId)
        .maybeSingle();
      setChoice((data as { candidate_id: string } | null)?.candidate_id ?? null);
    })();
  }, [supabase, session.id, voterId]);

  async function vote(candidateId: string) {
    if (!voterId || !session.voting_open) return;

    const previous = choice;
    setChoice(candidateId);
    setSaving(candidateId);
    setError(null);

    const { error: upsertError } = await supabase.from("votes").upsert(
      {
        session_id: session.id,
        voter_id: voterId,
        candidate_id: candidateId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "session_id,voter_id" },
    );

    setSaving(null);
    if (upsertError) {
      setChoice(previous);
      setError(upsertError.message);
    }
  }

  if (candidates.length === 0) {
    return (
      <p className="rounded-2xl bg-black/5 px-4 py-8 text-center text-sm text-zinc-500 dark:bg-white/10">
        ยังไม่มีตัวเลือก เดี๋ยวกลับมาดูใหม่นะ
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p
        className={`rounded-2xl px-4 py-3 text-sm font-medium ${
          session.voting_open
            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "bg-black/5 text-zinc-500 dark:bg-white/10"
        }`}
      >
        {session.voting_open
          ? choice
            ? "บันทึกโหวตแล้ว — แตะรูปอื่นเพื่อเปลี่ยนได้"
            : "เลือกหนึ่งรูป"
          : "ปิดโหวตแล้ว"}
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="grid grid-cols-2 gap-3">
        {candidates.map((c) => {
          const selected = choice === c.id;
          return (
            <li key={c.id}>
              <button
                onClick={() => void vote(c.id)}
                disabled={!session.voting_open || saving !== null}
                className={`w-full overflow-hidden rounded-2xl border text-left transition-all disabled:opacity-60 ${
                  selected
                    ? "border-foreground ring-2 ring-foreground"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={publicUrl("candidates", c.photo_path)}
                  alt={c.name}
                  className="aspect-square w-full object-cover"
                />
                <span className="flex items-center justify-between gap-1 px-3 py-2.5 text-sm font-medium">
                  <span className="truncate">{c.name}</span>
                  {saving === c.id ? (
                    <Spinner className="size-3.5 shrink-0" />
                  ) : (
                    selected && <span aria-hidden>✓</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
