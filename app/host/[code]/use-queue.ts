"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useInterval } from "@/lib/hooks";
import type { Submission } from "@/lib/types";

/**
 * Drives the host feed. The timer is derived from the row's `started_at` rather
 * than a local timeout, so a throttled or reloaded tab lands on the same item.
 */
export function useQueue(sessionId: string, displayMs: number, active: boolean) {
  const [current, setCurrent] = useState<Submission | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const advancing = useRef(false);

  const supabase = supabaseBrowser();

  const refreshCount = useCallback(async () => {
    const { count } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("status", "queued");
    setQueuedCount(count ?? 0);
  }, [supabase, sessionId]);

  const advance = useCallback(async () => {
    if (advancing.current) return;
    advancing.current = true;
    try {
      const { data } = await supabase.rpc("advance_queue", { sid: sessionId });
      setCurrent((data as Submission | null) ?? null);
      await refreshCount();
    } finally {
      advancing.current = false;
    }
  }, [supabase, sessionId, refreshCount]);

  /**
   * Adopts whatever is already on screen (another host tab, or a reload) and
   * only claims the next item when nothing is showing.
   */
  const sync = useCallback(async () => {
    const { data } = await supabase
      .from("submissions")
      .select("*")
      .eq("session_id", sessionId)
      .eq("status", "showing")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      setCurrent(data as Submission);
      await refreshCount();
    } else {
      await advance();
    }
  }, [supabase, sessionId, advance, refreshCount]);

  useEffect(() => {
    if (!active) return;

    const channel = supabase
      .channel(`queue:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "submissions",
          filter: `session_id=eq.${sessionId}`,
        },
        () => void sync(),
      )
      // The first sync runs once the socket is live, so nothing slips through
      // between the initial read and the subscription.
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") void sync();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, sessionId, supabase, sync]);

  useInterval(
    () => {
      setNow(Date.now());
      const started = current?.started_at ? new Date(current.started_at).getTime() : null;
      if (started !== null && Date.now() >= started + displayMs) void advance();
    },
    active ? 500 : null,
  );

  const started = current?.started_at ? new Date(current.started_at).getTime() : null;
  const remainingMs = started === null ? 0 : Math.max(0, started + displayMs - now);
  const progress = started === null ? 0 : 1 - remainingMs / displayMs;

  return { current, queuedCount, remainingMs, progress, advance };
}
