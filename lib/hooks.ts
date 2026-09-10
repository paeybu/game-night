"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Session } from "@/lib/types";

/** Keeps the session row (display_mode, voting_open, display_ms) live. */
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
  return useSyncExternalStore(
    noopSubscribe,
    readVoterId,
    () => null,
  );
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
