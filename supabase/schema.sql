-- Game Night — full schema. Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                    -- 6-char, shown in URL/QR
  display_mode text not null default 'feed' check (display_mode in ('feed','vote','results')),
  voting_open boolean not null default false,
  display_ms int not null default 10000,        -- 10s for dev, raise from admin panel
  created_at timestamptz not null default now()
);

-- Kept out of `sessions` so the sessions row itself holds no secret and can be
-- read (and realtime-subscribed) by anon.
create table if not exists session_admins (
  session_id uuid primary key references sessions on delete cascade,
  admin_token uuid not null unique default gen_random_uuid()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  text text,
  photo_path text,
  status text not null default 'queued' check (status in ('queued','showing','done')),
  created_at timestamptz not null default now(),
  started_at timestamptz
);
create index if not exists submissions_queue_idx
  on submissions (session_id, status, created_at);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  name text not null,
  photo_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists candidates_session_idx on candidates (session_id, sort_order);

create table if not exists votes (
  session_id uuid not null references sessions on delete cascade,
  voter_id uuid not null,                       -- generated client-side, kept in localStorage
  candidate_id uuid not null references candidates on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (session_id, voter_id)            -- one vote per device, upsert to change
);
create index if not exists votes_candidate_idx on votes (candidate_id);

-- ------------------------------------------------------------- functions

-- Atomic "advance queue": finish the current item, claim the next one.
-- SECURITY DEFINER because anon has no update policy on submissions.
create or replace function advance_queue(sid uuid) returns submissions
language plpgsql
security definer
set search_path = public
as $$
declare nxt submissions;
begin
  update submissions set status = 'done'
   where session_id = sid and status = 'showing';

  update submissions set status = 'showing', started_at = now()
   where id = (select id from submissions
                where session_id = sid and status = 'queued'
                order by created_at
                limit 1
                for update skip locked)
  returning * into nxt;

  return nxt;
end $$;

-- ----------------------------------------------------------------- views

create or replace view vote_counts as
  select c.session_id, c.id as candidate_id, c.name, c.photo_path, c.sort_order,
         count(v.voter_id) as votes
  from candidates c
  left join votes v on v.candidate_id = c.id
  group by c.id;

-- ------------------------------------------------------------------- rls

alter table sessions       enable row level security;
alter table session_admins enable row level security;
alter table submissions    enable row level security;
alter table candidates     enable row level security;
alter table votes          enable row level security;

-- session_admins intentionally has no policies: service role only.

drop policy if exists "read sessions"      on sessions;
drop policy if exists "read submissions"   on submissions;
drop policy if exists "insert submissions" on submissions;
drop policy if exists "read candidates"    on candidates;
drop policy if exists "read votes"         on votes;
drop policy if exists "insert votes"       on votes;
drop policy if exists "update votes"       on votes;

create policy "read sessions"      on sessions    for select to anon using (true);
create policy "read submissions"   on submissions for select to anon using (true);
create policy "insert submissions" on submissions for insert to anon with check (status = 'queued');
create policy "read candidates"    on candidates  for select to anon using (true);
create policy "read votes"         on votes       for select to anon using (true);
create policy "insert votes"       on votes       for insert to anon with check (true);
create policy "update votes"       on votes       for update to anon using (true) with check (true);

grant select on vote_counts to anon;
-- advance_queue is called from /api/host/advance with the service role.
revoke execute on function advance_queue(uuid) from anon;

-- -------------------------------------------------------------- realtime

do $$
begin
  alter publication supabase_realtime add table sessions;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table submissions;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table candidates;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table votes;
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('candidates', 'candidates', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon upload guest photos" on storage.objects;
create policy "anon upload guest photos" on storage.objects
  for insert to anon with check (bucket_id = 'photos');
-- The `candidates` bucket is written by the service role only (no anon policy).
