-- Postgres task queue (task 71): slow work (scoring, tailoring, later job search)
-- runs in a background worker instead of the web request.
--
-- Users enqueue tasks for their own jobs and can read their own tasks.
-- Only the worker (service_role) can claim, complete or fail them.
-- Claiming uses FOR UPDATE SKIP LOCKED, so several workers never take the same task.

create table public.tasks (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('score_job', 'tailor_job')),
  job_id       bigint references public.jobs (id) on delete cascade,
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts     integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- What the worker scans for.
create index tasks_ready_idx on public.tasks (run_after, id) where status = 'queued';
create index tasks_running_idx on public.tasks (locked_at) where status = 'running';
create index tasks_user_idx on public.tasks (user_id, created_at desc);
-- At most one queued/running task of each kind per job (no double enqueue).
create unique index tasks_one_active_per_job on public.tasks (job_id, kind) where status in ('queued', 'running');

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: users see their own tasks and may only enqueue.
-- ---------------------------------------------------------------------------
alter table public.tasks enable row level security;
revoke all on public.tasks from anon, authenticated;

-- Users choose only what to run; status, attempts, locks and results stay server-side.
grant select on public.tasks to authenticated;
grant insert (kind, job_id) on public.tasks to authenticated;

create policy "tasks: read own" on public.tasks
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "tasks: enqueue for own job" on public.tasks
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.jobs j where j.id = job_id and j.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Worker functions (service_role only).
-- ---------------------------------------------------------------------------

-- Claims up to p_limit ready tasks for p_worker. A task is ready when it is queued and
-- due, or when its worker died: running, locked longer than p_lock_timeout, attempts left.
-- Tasks whose worker died on the last attempt are marked failed.
create function public.claim_tasks(p_worker text, p_limit integer default 5, p_lock_timeout interval default '15 minutes')
returns setof public.tasks
language plpgsql set search_path = '' as $$
begin
  update public.tasks
     set status = 'failed', locked_at = null, locked_by = null,
         last_error = 'Worker stopped responding on the last attempt.'
   where status = 'running' and locked_at < now() - p_lock_timeout and attempts >= max_attempts;

  return query
  with picked as (
    select t.id
      from public.tasks t
     where (t.status = 'queued' and t.run_after <= now())
        or (t.status = 'running' and t.locked_at < now() - p_lock_timeout and t.attempts < t.max_attempts)
     order by t.run_after, t.id
     for update skip locked
     limit greatest(p_limit, 0)
  )
  update public.tasks t
     set status = 'running', locked_at = now(), locked_by = p_worker, attempts = t.attempts + 1
    from picked
   where t.id = picked.id
  returning t.*;
end;
$$;

-- Marks a claimed task done. Returns false if p_worker no longer holds it.
create function public.complete_task(p_id bigint, p_worker text, p_result jsonb default null)
returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.tasks
     set status = 'done', result = p_result, last_error = null, locked_at = null, locked_by = null
   where id = p_id and status = 'running' and locked_by = p_worker;
  return found;
end;
$$;

-- Records a failure. Retries later (30 s, 2 min, 8 min… backoff) while attempts are left
-- and p_retry is true; otherwise the task is failed for good. Returns false if p_worker
-- no longer holds it.
create function public.fail_task(p_id bigint, p_worker text, p_error text, p_retry boolean default true)
returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.tasks
     set status     = case when p_retry and attempts < max_attempts then 'queued' else 'failed' end,
         run_after  = case when p_retry and attempts < max_attempts
                           then now() + make_interval(secs => 30 * power(4, attempts - 1))
                           else run_after end,
         last_error = left(coalesce(p_error, 'Unknown error'), 1000),
         locked_at  = null,
         locked_by  = null
   where id = p_id and status = 'running' and locked_by = p_worker;
  return found;
end;
$$;

revoke all on function public.claim_tasks(text, integer, interval) from public, anon, authenticated;
revoke all on function public.complete_task(bigint, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_task(bigint, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_tasks(text, integer, interval) to service_role;
grant execute on function public.complete_task(bigint, text, jsonb) to service_role;
grant execute on function public.fail_task(bigint, text, text, boolean) to service_role;
