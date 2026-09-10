# Game Night

Big-screen share-and-vote app for a party. Guests scan a QR code, send photos and
notes to the host screen, and vote on candidates. UI copy is in Thai.

Next.js 16 (App Router) + Supabase (Postgres, Realtime, Storage).

## Setup

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor.
   It creates the tables, RLS policies, the `advance_queue` function, the
   `vote_counts` view, realtime publication entries, and both storage buckets.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API
   - `SUPABASE_SERVICE_ROLE_KEY` — same page, server-only
   - `CRON_SECRET` — any random string; the cleanup route rejects requests without it
3. `npm run dev`

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/` | host | Creates a session, sets the `admin_<CODE>` cookie, redirects to the display |
| `/host/[code]` | host screen | QR + feed of submissions, or the vote / results board |
| `/host/[code]/admin` | host phone | Display mode, timing, voting toggle, candidate upload |
| `/s/[code]` | guests | Tabs: send a photo/note, and vote |
| `/api/cleanup` | Vercel Cron | Daily: deletes `done` submissions and their photos older than 24h |

## How it works

- **Auth**: none for guests. The creator gets an httpOnly `admin_<CODE>` cookie holding
  a uuid stored in `session_admins`; every admin route re-checks it server-side and then
  acts with the service-role key. Guests talk to Supabase directly with the anon key
  under RLS.
- **Queue timing** is derived from `submissions.started_at` in the database, not a local
  `setTimeout`, so a throttled or reloaded host tab lands on the same item. Advancing
  goes through `advance_queue(sid)`, which finishes the current row and claims the next
  one with `for update skip locked` — safe with two host screens open.
- **Display modes**: `feed` (photos and notes), `vote` (candidate grid plus turnout only —
  no per-candidate counts), `results` (full tally, leader highlighted). The host switches
  modes from the admin panel; screens follow over realtime.
- **Photos** are compressed in the browser (max 1 MB / 1600px) before upload.

## Deploy

Push to Vercel, add the four env vars, deploy. `vercel.json` registers the daily cleanup
cron. Note that a free Supabase project pauses after 7 idle days — open the dashboard the
day before an event.
