-- JobPilot schema v1 on Supabase (task 71; RLS for task 72).
-- Mirrors the prototype's SQLite schema (src/lib/db.ts), made multi-user:
-- every row belongs to one user and row-level security keeps users apart.

-- ---------------------------------------------------------------------------
-- Profiles: one master resume per user.
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  resume_text text not null check (char_length(resume_text) between 200 and 50000),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs: one row per posting the user added.
-- ---------------------------------------------------------------------------
create table public.jobs (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company         text not null check (char_length(company) between 1 and 200),
  title           text not null check (char_length(title) between 1 and 200),
  apply_url       text not null check (apply_url ~ '^https?://' and char_length(apply_url) <= 2000),
  description     text not null check (char_length(description) between 50 and 50000),
  status          text not null default 'Matched'
                  check (status in ('Matched', 'Applied', 'Interviewing', 'Offer', 'Rejected')),
  score           integer check (score between 0 and 100),
  met             text[] not null default '{}',
  gaps            text[] not null default '{}',
  tailored_resume text,
  cover_letter    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- one job per posting link, per user
  unique (user_id, apply_url)
);
create index jobs_user_status_idx on public.jobs (user_id, status);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Status history: written only by triggers, read-only for users.
-- ---------------------------------------------------------------------------
create table public.status_events (
  id          bigint generated always as identity primary key,
  job_id      bigint not null references public.jobs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_at  timestamptz not null default now()
);
create index status_events_job_idx on public.status_events (job_id, id desc);
create index status_events_user_idx on public.status_events (user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Keep updated_at current.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- Users may not move a job to another user.
create function public.jobs_keep_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'jobs.user_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger jobs_keep_owner before update of user_id on public.jobs
  for each row execute function public.jobs_keep_owner();

-- Record the status history. SECURITY DEFINER because users have no insert
-- rights on status_events: the history can't be forged or edited by clients.
create function public.jobs_record_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.status_events (job_id, user_id, from_status, to_status, changed_at)
    values (new.id, new.user_id, null, new.status, new.created_at);
  elsif new.status is distinct from old.status then
    insert into public.status_events (job_id, user_id, from_status, to_status, changed_at)
    values (new.id, new.user_id, old.status, new.status, now());
  end if;
  return null;
end;
$$;
revoke all on function public.jobs_record_status() from public, anon, authenticated;

create trigger jobs_status_insert after insert on public.jobs
  for each row execute function public.jobs_record_status();
create trigger jobs_status_update after update of status on public.jobs
  for each row execute function public.jobs_record_status();

-- ---------------------------------------------------------------------------
-- Row-level security: every user sees and changes only their own rows.
-- Anonymous (signed-out) requests get nothing.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.status_events enable row level security;

revoke all on public.profiles, public.jobs, public.status_events from anon;

create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "jobs: own rows" on public.jobs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Read-only: no insert/update/delete policies, so clients can't write history.
create policy "status_events: read own" on public.status_events
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.status_events from authenticated;
