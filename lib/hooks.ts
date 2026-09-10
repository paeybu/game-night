"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Session } from "@/lib/types";

/**
 * Runs `callback` on an interval, paused while the tab is hidden and fired
 * immediately when it becomes visible again.
 *
 * Guests poll instead of subscribing: 200 phones would be 200 realtime
 * connections, which is the entire free-tier allowance before the host
 * screen even connects. Polling costs REST requests, which are far cheaper.
 */
export function usePoll(callback: () => void, ms: number | null) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (ms === null) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // Never call straight from the effect body — that would be a synchronous
    // setState during mount. Everything goes through a timer or an event.
    const tick = () => {
      if (!cancelled && document.visibilityState === "visible") saved.current();
    };

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(tick, ms);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    const first = setTimeout(tick, 0);
    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(first);
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ms]);
}

/** How often a guest re-reads the session row. */
export const SESSION_POLL_MS = 10000;

/**
 * Session state for guests. Polled, not subscribed — see {@link usePoll}.
 */
export function usePolledSession(initial: Session) {
  const [session, setSession] = useState(initial);

  usePoll(() => {
    void (async () => {
      const { data } = await supabaseBrowser()
        .from("sessions")
        .select("*")
        .eq("id", initial.id)
        .maybeSingle();
      if (data) setSession(data as Session);
    })();
  }, SESSION_POLL_MS);

  return session;
}

/**
 * Session state for the host screen. Realtime is worth a connection here:
 * there is exactly one display, and mode switches should land instantly.
 */
export function useLiveSession(initial: Session) {
  const [session, setSession] = useState(initial);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`session:${initial.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${initial.id}`,
        },
        (payload: { new: Record<string, unknown> }) => setSession(payload.new as Session),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initial.id]);

  return session;
}

/** Requests a screen wake lock and re-acquires it when the tab becomes visible. */
export function useWakeLock(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Denied (not a user gesture, low battery, …) — nothing to do.
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release();
    };
  }, [enabled]);
}

const noopSubscribe = () => () => {};

/** `window.location.origin`, empty string while server-rendering. */
export function useOrigin() {
  return useSyncExternalStore(
    noopSubscribe,
    () => window.location.origin,
    () => "",
  );
}

function readVoterId() {
  let id = localStorage.getItem("voter_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("voter_id", id);
  }
  return id;
}

/** A voter id that survives reloads, created on first use. */
export function useVoterId() {
  return useSyncExternalStore(noopSubscribe, readVoterId, () => null);
}

/** setInterval that always calls the latest callback. */
export function useInterval(callback: () => void, ms: number | null) {
  const saved = useRef(callback);

  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
