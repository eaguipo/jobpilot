-- Audit log (task 75): a tamper-proof record of everything JobPilot generates for a
-- user (match scores, tailored resumes, cover letters) and, later, every submission
-- (Epic 5) with its confirmation screenshot (story 95).
--
-- Entries are written only by a trigger on public.jobs (security definer), the same
-- way status_events is. Users can read their own entries; nobody signed in can
-- insert, edit or delete them, so the history can't be forged or tidied up.
--
-- Entries outlive the job: deleting a job clears job_id, and the company and title
-- are copied in so the entry still says what it was for.

create table public.audit_log (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  job_id          bigint references public.jobs (id) on delete set null,
  kind            text not null check (kind in (
                    'match_scored',
                    'resume_tailored',
                    'cover_letter_written',
                    'application_submitted'   -- reserved for Epic 5
                  )),
  job_company     text not null,
  job_title       text not null,
  -- Small structured facts, e.g. {"score": 82, "met": [...], "gaps": [...]}.
  detail          jsonb not null default '{}'::jsonb,
  -- Exact text of a generated document, so you can see what was produced/sent.
  document        text,
  -- Storage path of the confirmation screenshot (story 95); null until then.
  screenshot_path text,
  created_at      timestamptz not null default now()
);
create index audit_log_user_created_idx on public.audit_log (user_id, created_at desc, id desc);
create index audit_log_job_idx on public.audit_log (job_id);

-- ---------------------------------------------------------------------------
-- Trigger: one entry per generated item, only when the value really changed.
-- Clearing a value (setting it to null) is not a generation, so it isn't logged.
-- ---------------------------------------------------------------------------
create function public.jobs_record_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.score is not null and new.score is distinct from old.score then
    insert into public.audit_log (user_id, job_id, kind, job_company, job_title, detail)
    values (new.user_id, new.id, 'match_scored', new.company, new.title,
            jsonb_build_object('score', new.score, 'met', to_jsonb(new.met), 'gaps', to_jsonb(new.gaps)));
  end if;

  if new.tailored_resume is not null and new.tailored_resume is distinct from old.tailored_resume then
    insert into public.audit_log (user_id, job_id, kind, job_company, job_title, document)
    values (new.user_id, new.id, 'resume_tailored', new.company, new.title, new.tailored_resume);
  end if;

  if new.cover_letter is not null and new.cover_letter is distinct from old.cover_letter then
    insert into public.audit_log (user_id, job_id, kind, job_company, job_title, document)
    values (new.user_id, new.id, 'cover_letter_written', new.company, new.title, new.cover_letter);
  end if;

  return null;
end;
$$;
revoke all on function public.jobs_record_audit() from public, anon, authenticated;

create trigger jobs_audit_update after update of score, tailored_resume, cover_letter on public.jobs
  for each row execute function public.jobs_record_audit();

-- ---------------------------------------------------------------------------
-- Row-level security: read your own entries, write nothing.
-- ---------------------------------------------------------------------------
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy "audit_log: read own" on public.audit_log
  for select to authenticated
  using (user_id = (select auth.uid()));
