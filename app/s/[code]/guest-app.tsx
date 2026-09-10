"use client";

import { useState } from "react";
import { useLiveSession } from "@/lib/hooks";
import type { Session } from "@/lib/types";
import ShareTab from "./share-tab";
import VoteTab from "./vote-tab";

type Tab = "share" | "vote";

export default function GuestApp({ session: initialSession }: { session: Session }) {
  const session = useLiveSession(initialSession);
  const [tab, setTab] = useState<Tab>("share");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Game Night</h1>
        <span className="font-mono text-sm text-zinc-500">{session.code}</span>
      </header>

      <nav className="mb-6 grid grid-cols-2 gap-1 rounded-full bg-black/5 p-1 dark:bg-white/10">
        {(["share", "vote"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative rounded-full py-2.5 text-sm font-medium transition-colors ${
              tab === t ? "bg-background shadow-sm" : "text-zinc-500"
            }`}
          >
            {t === "share" ? "ส่งขึ้นจอ" : "โหวต"}
            {t === "vote" && session.voting_open && (
              <span className="absolute top-2 right-3 size-2 rounded-full bg-emerald-500" />
            )}
          </button>
        ))}
      </nav>

      {tab === "share" ? <ShareTab session={session} /> : <VoteTab session={session} />}
    </main>
  );
}
