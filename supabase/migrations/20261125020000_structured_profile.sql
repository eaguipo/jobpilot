-- Story 12: the master resume parsed into sections (contact, summary, experience,
-- education, skills), shown on the Profile page.
--
-- structured      the parsed JSON (shape checked in src/lib/resume-parse.ts, on write and read)
-- structured_from md5 of the resume text it was parsed from
-- resume_md5      md5 of the current resume text, kept by Postgres
--
-- The app saves a parse with "where resume_md5 = <hash of the text it parsed>", so a
-- resume edited while the model was working can't get the old text's structure.
-- When structured_from <> resume_md5, the Profile page says the structure is out of date.
-- md5 is only used to notice changes, not for security.

alter table public.profiles
  add column resume_md5 text generated always as (md5(resume_text)) stored,
  add column structured jsonb
    check (structured is null or (jsonb_typeof(structured) = 'object' and octet_length(structured::text) <= 100000)),
  add column structured_from text check (structured_from is null or structured_from ~ '^[0-9a-f]{32}$'),
  add column structured_at timestamptz,
  add constraint profiles_structured_together
    check ((structured is null) = (structured_from is null) and (structured is null) = (structured_at is null));

-- Parsing a resume uses one AI run, like scoring and tailoring.
alter table public.ai_usage drop constraint ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('score', 'tailor', 'parse'));

create or replace function public.use_ai_quota(p_kind text)
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
  if p_kind not in ('score', 'tailor', 'parse') then
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
-- create or replace keeps the grants from 20261117000000_ai_quota.sql.

-- updated_at means "resume last saved" on the Profile page, so saving only the parsed
-- structure must not move it.
create function public.profiles_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.resume_text is distinct from old.resume_text
     or (new.structured is not distinct from old.structured
         and new.structured_from is not distinct from old.structured_from
         and new.structured_at is not distinct from old.structured_at) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.profiles_touch();
