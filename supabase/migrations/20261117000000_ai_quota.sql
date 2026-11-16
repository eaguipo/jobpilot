-- AI usage limits (task 74): everyone shares the app's Gemini key, so each user gets
-- a daily allowance and a per-minute rate limit on AI runs (scoring, tailoring).
--
-- Users can read their own usage but never write it: the only way in is use_ai_quota(),
-- which checks the limits and records the run in one locked step, so parallel clicks
-- can't slip past the limit, and deleting rows to reset the count isn't possible.

-- One row of settings. Change the limits in the SQL editor, no deploy needed:
--   update public.ai_limits set per_day = 100;
create table public.ai_limits (
  id         boolean primary key default true check (id),
  per_day    integer not null check (per_day >= 0),
  per_minute integer not null check (per_minute >= 0)
);
insert into public.ai_limits (per_day, per_minute) values (50, 10);

create table public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('score', 'tailor')),
  created_at timestamptz not null default now()
);
create index ai_usage_user_time_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_limits enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.ai_limits, public.ai_usage from anon, authenticated;

grant select on public.ai_usage to authenticated;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Days are counted in UTC.
create function public.ai_day_start() returns timestamptz
language sql stable set search_path = '' as $$
  select date_trunc('day', now() at time zone 'utc') at time zone 'utc'
$$;

-- Checks the signed-in user's limits and, if allowed, records one AI run.
-- Returns { allowed, reason ('daily' | 'rate' | null), used_today, per_day, retry_after_seconds }.
create function public.use_ai_quota(p_kind text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid        uuid := auth.uid();
  lim        public.ai_limits;
  used_today integer;
  last_min   integer;
  oldest_min timestamptz;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('score', 'tailor') then
    raise exception 'Unknown AI run kind: %', p_kind using errcode = '22023';
  end if;

  -- One check at a time per user, so two parallel clicks can't both take the last run.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 74));

  select * into lim from public.ai_limits;
  select count(*) into used_today from public.ai_usage
   where user_id = uid and created_at >= public.ai_day_start();
  select count(*), min(created_at) into last_min, oldest_min from public.ai_usage
   where user_id = uid and created_at > now() - interval '1 minute';

  if used_today >= lim.per_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily', 'used_today', used_today, 'per_day', lim.per_day,
      'retry_after_seconds', ceil(extract(epoch from (public.ai_day_start() + interval '1 day' - now())))::integer);
  end if;
  if last_min >= lim.per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'rate', 'used_today', used_today, 'per_day', lim.per_day,
      'retry_after_seconds', greatest(1, ceil(extract(epoch from (oldest_min + interval '1 minute' - now())))::integer));
  end if;

  insert into public.ai_usage (user_id, kind) values (uid, p_kind);
  return jsonb_build_object('allowed', true, 'reason', null, 'used_today', used_today + 1, 'per_day', lim.per_day,
    'retry_after_seconds', 0);
end;
$$;

-- The signed-in user's runs today and the daily allowance, for showing "N left today".
create function public.ai_quota_status()
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'used_today', (select count(*) from public.ai_usage
                    where user_id = auth.uid() and created_at >= public.ai_day_start()),
    'per_day', (select per_day from public.ai_limits))
$$;

revoke all on function public.use_ai_quota(text), public.ai_quota_status(), public.ai_day_start() from public, anon;
grant execute on function public.use_ai_quota(text), public.ai_quota_status() to authenticated;
grant execute on function public.ai_day_start() to authenticated;
