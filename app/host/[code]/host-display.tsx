"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useLiveSession, useOrigin, useWakeLock } from "@/lib/hooks";
import { publicUrl } from "@/lib/storage";
import type { Session } from "@/lib/types";
import { useQueue } from "./use-queue";
import VoteBoard from "./vote-board";

export default function HostDisplay({
  session: initialSession,
  isAdmin,
}: {
  session: Session;
  isAdmin: boolean;
}) {
  const session = useLiveSession(initialSession);
  const origin = useOrigin();
  const guestUrl = origin ? `${origin}/s/${session.code}` : "";
  useWakeLock();

  const feedActive = session.display_mode === "feed";
  const { current, queuedCount, progress } = useQueue(
    session.id,
    session.display_ms,
    feedActive,
  );

  return (
    // Heavier scrim than the rest of the site: guest photos and the tally need
    // a near-neutral backing, but the beach still reads through at the edges.
    <main className="relative flex min-h-dvh flex-1 flex-col bg-zinc-950/88 text-zinc-50">
      {feedActive ? (
        current ? (
          <>
            <div className="flex flex-1 flex-col items-center justify-center gap-8 p-10">
              {current.photo_path && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={publicUrl("photos", current.photo_path)}
                  alt=""
                  className="max-h-[70vh] max-w-full rounded-3xl object-contain shadow-2xl"
                />
              )}
              {current.text && (
                <p className="max-w-4xl text-center text-4xl leading-tight font-medium text-balance">
                  {current.text}
                </p>
              )}
            </div>
            <div className="h-2 w-full bg-white/10">
              <div
                className="h-full bg-white transition-[width] duration-500 ease-linear"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </>
        ) : (
          <IdleScreen code={session.code} guestUrl={guestUrl} />
        )
      ) : (
        <VoteBoard
          sessionId={session.id}
          votingOpen={session.voting_open}
          reveal={session.display_mode === "results"}
        />
      )}

      {feedActive && current && guestUrl && (
        <div className="absolute right-6 bottom-8 flex items-center gap-3 rounded-2xl bg-white p-3 text-zinc-900">
          <QRCodeSVG value={guestUrl} size={88} />
          <div className="pr-2">
            <p className="text-xs tracking-widest text-zinc-500 uppercase">เข้าร่วม</p>
            <p className="font-mono text-xl font-semibold">{session.code}</p>
            {queuedCount > 0 && <p className="text-xs text-zinc-500">รออีก {queuedCount} รายการ</p>}
          </div>
        </div>
      )}

      {session.display_mode === "vote" && guestUrl && (
        <div className="absolute right-6 bottom-6 rounded-2xl bg-white p-3 text-zinc-900">
          <QRCodeSVG value={guestUrl} size={72} />
        </div>
      )}

      {isAdmin && (
        <Link
          href={`/host/${session.code}/admin`}
          className="absolute top-5 left-6 rounded-full border border-white/20 px-4 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          แอดมิน
        </Link>
      )}
    </main>
  );
}

function IdleScreen({ code, guestUrl }: { code: string; guestUrl: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 p-10 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">สแกนเพื่อเข้าร่วม</h1>
      {guestUrl && (
        <div className="rounded-3xl bg-white p-6">
          <QRCodeSVG value={guestUrl} size={320} />
        </div>
      )}
      <div className="space-y-2">
        <p className="font-mono text-6xl font-semibold tracking-[0.2em]">{code}</p>
        <p className="text-xl text-zinc-400">ส่งรูปหรือข้อความ แล้วจะขึ้นบนจอนี้เลย</p>
      </div>
    </div>
  );
}
