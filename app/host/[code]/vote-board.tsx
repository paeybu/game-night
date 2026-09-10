"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { publicUrl } from "@/lib/storage";
import type { Candidate, VoteCount } from "@/lib/types";

/**
 * `reveal` is the difference between the two vote screens: while voting is
 * running the room only sees turnout, and the tally stays hidden until the
 * host switches the display to results.
 */
export default function VoteBoard({
  sessionId,
  votingOpen,
  reveal,
}: {
  sessionId: string;
  votingOpen: boolean;
  reveal: boolean;
}) {
  const supabase = supabaseBrowser();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [counts, setCounts] = useState<VoteCount[]>([]);
  const [turnout, setTurnout] = useState(0);

  const refetch = useCallback(async () => {
    const [{ data: candidateRows }, { count }] = await Promise.all([
      supabase.from("candidates").select("*").eq("session_id", sessionId).order("sort_order"),
      supabase
        .from("votes")
        .select("voter_id", { count: "exact", head: true })
        .eq("session_id", sessionId),
    ]);

    setCandidates((candidateRows as Candidate[] | null) ?? []);
    setTurnout(count ?? 0);

    if (reveal) {
      const { data } = await supabase
        .from("vote_counts")
        .select("*")
        .eq("session_id", sessionId)
        .order("sort_order");
      setCounts((data as VoteCount[] | null) ?? []);
    }
  }, [supabase, sessionId, reveal]);

  useEffect(() => {
    const channel = supabase
      .channel(`board:${sessionId}:${reveal ? "results" : "live"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `session_id=eq.${sessionId}` },
        () => void refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "candidates", filter: `session_id=eq.${sessionId}` },
        () => void refetch(),
      )
      // Fetching once the channel is live avoids a gap between load and subscribe.
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void refetch();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, sessionId, reveal, refetch]);

  if (candidates.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-2xl text-zinc-500">
        ยังไม่มีตัวเลือก
      </div>
    );
  }

  return reveal ? (
    <Results counts={counts} />
  ) : (
    <LiveVote candidates={candidates} turnout={turnout} votingOpen={votingOpen} />
  );
}

function LiveVote({
  candidates,
  turnout,
  votingOpen,
}: {
  candidates: Candidate[];
  turnout: number;
  votingOpen: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-8 p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl font-semibold tracking-tight">
          {votingOpen ? "โหวตเลย" : "ปิดโหวตแล้ว"}
        </h2>
        <p className="text-xl text-zinc-400">ประกาศผลตอนท้ายงาน</p>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-6 lg:grid-cols-4">
        {candidates.map((c) => (
          <div
            key={c.id}
            className="flex flex-col overflow-hidden rounded-3xl border border-white/15"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicUrl("candidates", c.photo_path)}
              alt={c.name}
              className="aspect-square w-full object-cover"
            />
            <p className="truncate p-4 text-center text-2xl font-medium">{c.name}</p>
          </div>
        ))}
      </div>

      <div className="text-center">
        <p className="text-8xl font-semibold tabular-nums">{turnout}</p>
        <p className="mt-1 text-2xl text-zinc-400">
          คนโหวตแล้ว
        </p>
      </div>
    </div>
  );
}

function Results({ counts }: { counts: VoteCount[] }) {
  const total = counts.reduce((sum, c) => sum + Number(c.votes), 0);
  const leader = Math.max(0, ...counts.map((c) => Number(c.votes)));
  const ranked = [...counts].sort((a, b) => Number(b.votes) - Number(a.votes));

  return (
    <div className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl font-semibold tracking-tight">ผลโหวต</h2>
        <p className="text-xl text-zinc-400">
          {total} โหวต
        </p>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-6 lg:grid-cols-3">
        {ranked.map((c) => {
          const votes = Number(c.votes);
          const share = total === 0 ? 0 : votes / total;
          const isLeader = leader > 0 && votes === leader;

          return (
            <div
              key={c.candidate_id}
              className={`flex flex-col overflow-hidden rounded-3xl border transition-colors ${
                isLeader ? "border-amber-400 bg-amber-400/10" : "border-white/15"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={publicUrl("candidates", c.photo_path)}
                alt={c.name}
                className="aspect-square w-full object-cover"
              />
              <div className="space-y-2 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-2xl font-medium">
                    {isLeader && <span aria-hidden>🏆 </span>}
                    {c.name}
                  </span>
                  <span className="text-3xl font-semibold tabular-nums">{votes}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${
                      isLeader ? "bg-amber-400" : "bg-white"
                    }`}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
