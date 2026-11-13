import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Task queue tests against the LOCAL Supabase (`npm run test:db`). Skipped by `npm test`.
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run queue tests against a non-local Supabase: ${url}`);
}

const PASSWORD = "test-password-123!";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
let n = 0;
const job = () => ({
  company: "Acme",
  title: "Frontend Engineer",
  apply_url: `https://jobs.example.com/q-${Date.now()}-${n++}`,
  description: "A frontend role building React and TypeScript apps for customers.",
});

interface Task {
  id: number;
  user_id: string;
  kind: string;
  job_id: number;
  status: string;
  attempts: number;
  max_attempts: number;
  run_after: string;
  locked_by: string | null;
  last_error: string | null;
  result: unknown;
}

describe.skipIf(!enabled)("Postgres task queue", () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  const users: string[] = [];

  async function signedIn(email: string) {
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const client = createClient(url!, publishable!, noSession);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return client;
  }
  async function newJob(client: SupabaseClient) {
    const { data, error } = await client.from("jobs").insert(job()).select("id").single();
    if (error) throw error;
    return data.id as number;
  }
  async function enqueue(client: SupabaseClient, kind = "score_job") {
    const jobId = await newJob(client);
    const { data, error } = await client.from("tasks").insert({ kind, job_id: jobId }).select().single();
    if (error) throw error;
    return data as Task;
  }
  const claim = async (worker: string, limit = 5, lockTimeout = "15 minutes") => {
    const { data, error } = await admin.rpc("claim_tasks", { p_worker: worker, p_limit: limit, p_lock_timeout: lockTimeout });
    if (error) throw error;
    return data as Task[];
  };
  const getTask = async (id: number) => (await admin.from("tasks").select().eq("id", id).single()).data as Task;

  beforeAll(async () => {
    admin = createClient(url!, secret!, noSession);
    const stamp = Date.now();
    alice = await signedIn(`q-alice-${stamp}@example.com`);
    bob = await signedIn(`q-bob-${stamp}@example.com`);
  });

  // Each test starts with an empty queue, so claims only see that test's tasks.
  beforeEach(async () => {
    await admin.from("tasks").delete().gte("id", 0);
  });

  afterAll(async () => {
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  describe("users", () => {
    it("enqueue a task for their own job; the server fills in owner and status", async () => {
      const task = await enqueue(alice);
      expect(task).toMatchObject({ kind: "score_job", status: "queued", attempts: 0, max_attempts: 3, locked_by: null });
      expect((await alice.from("tasks").select("id")).data).toEqual([{ id: task.id }]);
    });

    it("can't enqueue for someone else's job or see their tasks", async () => {
      const aliceJob = await newJob(alice);
      const { error } = await bob.from("tasks").insert({ kind: "score_job", job_id: aliceJob });
      expect(error?.code).toBe("42501");
      await enqueue(alice);
      expect((await bob.from("tasks").select("id")).data).toEqual([]);
    });

    it("can't set status, attempts, locks or results themselves", async () => {
      const jobId = await newJob(alice);
      for (const extra of [{ status: "done" }, { attempts: 9 }, { locked_by: "me" }, { result: { score: 100 } }, { max_attempts: 10 }]) {
        const { error } = await alice.from("tasks").insert({ kind: "score_job", job_id: jobId, ...extra });
        expect(error?.code, JSON.stringify(extra)).toBe("42501"); // no column privilege
      }
      const task = await enqueue(alice);
      const upd = await alice.from("tasks").update({ status: "done" }).eq("id", task.id).select();
      expect(upd.error?.code).toBe("42501");
      const del = await alice.from("tasks").delete().eq("id", task.id).select();
      expect(del.error?.code).toBe("42501");
    });

    it("can't call the worker functions", async () => {
      for (const [fn, args] of [
        ["claim_tasks", { p_worker: "evil" }],
        ["complete_task", { p_id: 1, p_worker: "evil" }],
        ["fail_task", { p_id: 1, p_worker: "evil", p_error: "x" }],
      ] as const) {
        const { error } = await alice.rpc(fn, args);
        expect(error?.code, fn).toBe("42501");
      }
    });

    it("can't queue the same kind of task twice for one job while it's active", async () => {
      const task = await enqueue(alice);
      const again = await alice.from("tasks").insert({ kind: "score_job", job_id: task.job_id });
      expect(again.error?.code).toBe("23505");
      const other = await alice.from("tasks").insert({ kind: "tailor_job", job_id: task.job_id });
      expect(other.error).toBeNull();
    });

    it("can't queue an unknown kind", async () => {
      const jobId = await newJob(alice);
      expect((await alice.from("tasks").insert({ kind: "delete_everything", job_id: jobId })).error?.code).toBe("23514");
    });
  });

  describe("worker", () => {
    it("claims ready tasks oldest first and marks them running", async () => {
      const a = await enqueue(alice);
      const b = await enqueue(bob);
      const claimed = await claim("worker-1");
      expect(claimed.map((t) => t.id)).toEqual([a.id, b.id]);
      expect(claimed.every((t) => t.status === "running" && t.locked_by === "worker-1" && t.attempts === 1)).toBe(true);
      expect(await claim("worker-2")).toEqual([]); // nothing left
    });

    it("never gives the same task to two workers claiming at the same time", async () => {
      const tasks = await Promise.all(Array.from({ length: 6 }, () => enqueue(alice)));
      const results = await Promise.all(Array.from({ length: 6 }, (_, i) => claim(`racer-${i}`, 2)));
      const ids = results.flat().map((t) => t.id);
      expect(ids).toHaveLength(tasks.length);
      expect(new Set(ids).size).toBe(tasks.length); // no task claimed twice
    });

    it("respects the limit", async () => {
      await Promise.all([enqueue(alice), enqueue(alice), enqueue(alice)]);
      expect(await claim("w", 2)).toHaveLength(2);
      expect(await claim("w", 2)).toHaveLength(1);
    });

    it("completes a task with a result, only by the worker that holds it", async () => {
      const task = await enqueue(alice);
      await claim("worker-1");
      expect((await admin.rpc("complete_task", { p_id: task.id, p_worker: "someone-else", p_result: {} })).data).toBe(false);
      expect((await admin.rpc("complete_task", { p_id: task.id, p_worker: "worker-1", p_result: { score: 82 } })).data).toBe(true);
      expect(await getTask(task.id)).toMatchObject({ status: "done", result: { score: 82 }, locked_by: null });
      // The owner sees the result.
      expect((await alice.from("tasks").select("status, result").eq("id", task.id).single()).data).toEqual({
        status: "done",
        result: { score: 82 },
      });
    });

    it("retries a failure later with backoff, then gives up after max attempts", async () => {
      const task = await enqueue(alice);
      const delays: number[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) await admin.from("tasks").update({ run_after: new Date().toISOString() }).eq("id", task.id); // skip the wait
        const [claimed] = await claim("w");
        expect(claimed?.attempts).toBe(attempt);
        const before = Date.now();
        expect((await admin.rpc("fail_task", { p_id: task.id, p_worker: "w", p_error: `boom ${attempt}` })).data).toBe(true);
        const t = await getTask(task.id);
        if (attempt < 3) {
          expect(t.status).toBe("queued");
          delays.push(Math.round((new Date(t.run_after).getTime() - before) / 1000));
          expect(await claim("w")).toEqual([]); // not due yet
        } else {
          expect(t).toMatchObject({ status: "failed", last_error: "boom 3" });
        }
      }
      expect(delays[0]).toBeGreaterThanOrEqual(29);
      expect(delays[0]).toBeLessThanOrEqual(31);
      expect(delays[1]).toBeGreaterThanOrEqual(119);
      expect(delays[1]).toBeLessThanOrEqual(121);
    });

    it("fails for good without retry when asked (e.g. bad API key)", async () => {
      const task = await enqueue(alice);
      await claim("w");
      await admin.rpc("fail_task", { p_id: task.id, p_worker: "w", p_error: "x".repeat(5000), p_retry: false });
      const t = await getTask(task.id);
      expect(t.status).toBe("failed");
      expect(t.last_error).toHaveLength(1000);
    });

    it("re-claims a task whose worker died, and fails it if that was the last attempt", async () => {
      const task = await enqueue(alice);
      await claim("dead-worker");
      expect(await claim("w2", 5, "1 second")).toEqual([]); // still fresh
      const old = new Date(Date.now() - 60_000).toISOString();
      await admin.from("tasks").update({ locked_at: old }).eq("id", task.id);
      const [reclaimed] = await claim("w2", 5, "1 second");
      expect(reclaimed).toMatchObject({ id: task.id, locked_by: "w2", attempts: 2 });
      // The dead worker can no longer complete it.
      expect((await admin.rpc("complete_task", { p_id: task.id, p_worker: "dead-worker" })).data).toBe(false);

      await admin.from("tasks").update({ locked_at: old, attempts: 3 }).eq("id", task.id);
      expect(await claim("w3", 5, "1 second")).toEqual([]);
      expect(await getTask(task.id)).toMatchObject({ status: "failed", last_error: "Worker stopped responding on the last attempt." });
    });
  });

  it("deleting a job removes its tasks", async () => {
    const task = await enqueue(alice);
    await alice.from("jobs").delete().eq("id", task.job_id);
    expect((await admin.from("tasks").select("id").eq("id", task.id)).data).toEqual([]);
  });
});
