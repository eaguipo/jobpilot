import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeGenerate } from "../lib/fake-llm";
import { LlmError, type GenerateJson } from "../lib/llm";
import { runWorker } from "./run";

/**
 * Worker tests against the LOCAL Supabase (`npm run test:db`) with the offline fake model.
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run worker tests against a non-local Supabase: ${url}`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const RESUME = "Sam Lee — Frontend Engineer\nWonka Industries (2020–present)\n- Built React and TypeScript apps with Next.js for 2M users.\n" + "- Led accessibility work. ".repeat(8);
let n = 0;

describe.skipIf(!enabled)("worker", () => {
  let admin: SupabaseClient;
  let user: SupabaseClient;
  let noResumeUser: SupabaseClient;
  const userIds: string[] = [];
  const logs: string[] = [];
  const log = (l: string) => logs.push(l);

  async function signedIn(email: string) {
    const created = await admin.auth.admin.createUser({ email, password: "test-password-123!", email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const c = createClient(url!, publishable!, noSession);
    const { error } = await c.auth.signInWithPassword({ email, password: "test-password-123!" });
    if (error) throw error;
    return c;
  }
  async function jobWithTask(client: SupabaseClient, kind: string, description = "Frontend role: React, TypeScript, GraphQL and AWS required.") {
    const { data: job, error } = await client
      .from("jobs")
      .insert({ company: "Umbrella", title: "Senior Frontend Engineer", apply_url: `https://jobs.example.com/w-${Date.now()}-${n++}`, description })
      .select("id")
      .single();
    if (error) throw error;
    const { data: task, error: e2 } = await client.from("tasks").insert({ kind, job_id: job.id }).select("id").single();
    if (e2) throw e2;
    return { jobId: job.id as number, taskId: task.id as number };
  }
  const task = async (id: number) => (await admin.from("tasks").select("status, attempts, last_error, result").eq("id", id).single()).data!;
  const jobRow = async (id: number) =>
    (await admin.from("jobs").select("score, met, gaps, tailored_resume, cover_letter").eq("id", id).single()).data!;

  beforeAll(async () => {
    admin = createClient(url!, secret!, noSession);
    const stamp = Date.now();
    user = await signedIn(`w-user-${stamp}@example.com`);
    noResumeUser = await signedIn(`w-noresume-${stamp}@example.com`);
    const { error } = await user.from("profiles").insert({ resume_text: RESUME });
    if (error) throw error;
  });
  beforeEach(async () => {
    await admin.from("tasks").delete().gte("id", 0);
    logs.length = 0;
  });
  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("scores a job: saves score, met and gaps on the job and the result on the task", async () => {
    const { jobId, taskId } = await jobWithTask(user, "score_job");
    const summary = await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", log });
    expect(summary).toEqual({ claimed: 1, done: 1, retrying: 0, failed: 0 });
    expect(await jobRow(jobId)).toMatchObject({
      score: 50,
      met: ["React — on your resume", "TypeScript — on your resume"],
      gaps: ["GraphQL", "AWS"],
    });
    expect(await task(taskId)).toMatchObject({ status: "done", attempts: 1, result: { score: 50, met: 2, gaps: 2 } });
    // The owner can see the updated job through RLS.
    expect((await user.from("jobs").select("score").eq("id", jobId).single()).data?.score).toBe(50);
  });

  it("tailors a job using the saved gaps", async () => {
    const { jobId, taskId } = await jobWithTask(user, "tailor_job");
    await admin.from("jobs").update({ gaps: ["GraphQL"] }).eq("id", jobId);
    let sentGaps = "";
    const spy: GenerateJson = async (req) => {
      sentGaps = /<gaps>\n([\s\S]*?)\n<\/gaps>/.exec(req.prompt)?.[1] ?? "";
      return fakeGenerate(req);
    };
    await runWorker({ db: admin, generate: spy, workerId: "w1", log });
    const row = await jobRow(jobId);
    expect(row.tailored_resume).toContain("Tailored for Senior Frontend Engineer at Umbrella.");
    expect(row.cover_letter).toMatch(/^Dear Hiring Manager,/);
    expect(sentGaps).toBe("- GraphQL");
    expect((await task(taskId)).status).toBe("done");
  });

  it("processes several tasks in one run, in batches", async () => {
    const created = await Promise.all([1, 2, 3, 4, 5].map(() => jobWithTask(user, "score_job")));
    const summary = await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", batchSize: 2, log });
    expect(summary).toEqual({ claimed: 5, done: 5, retrying: 0, failed: 0 });
    for (const c of created) expect((await task(c.taskId)).status).toBe("done");
  });

  it("stops at maxTasks and leaves the rest queued", async () => {
    await Promise.all([1, 2, 3].map(() => jobWithTask(user, "score_job")));
    const summary = await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", maxTasks: 2, log });
    expect(summary.claimed).toBe(2);
    const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("status", "queued");
    expect(count).toBe(1);
  });

  it("retries a busy model later instead of failing", async () => {
    const { jobId, taskId } = await jobWithTask(user, "score_job", "Frontend role with React. FAKE_LLM_UNAVAILABLE makes the fake model busy.");
    const summary = await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", log });
    expect(summary).toEqual({ claimed: 1, done: 0, retrying: 1, failed: 0 });
    expect(await task(taskId)).toMatchObject({ status: "queued", attempts: 1, last_error: "unavailable: Fake Gemini is busy." });
    expect((await jobRow(jobId)).score).toBeNull();
    expect(logs.join("\n")).toContain("(will retry)");
  });

  it("fails for good when the user has no resume", async () => {
    const { taskId } = await jobWithTask(noResumeUser, "score_job");
    const summary = await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", log });
    expect(summary.failed).toBe(1);
    expect(await task(taskId)).toMatchObject({ status: "failed", last_error: "Add your resume on the Profile page first." });
  });

  it("fails for good on a rejected API key (no point retrying)", async () => {
    const { taskId } = await jobWithTask(user, "score_job");
    const badKey: GenerateJson = async () => {
      throw new LlmError("auth", "Gemini rejected the API key.");
    };
    await runWorker({ db: admin, generate: badKey, workerId: "w1", log });
    expect(await task(taskId)).toMatchObject({ status: "failed", attempts: 1, last_error: "auth: Gemini rejected the API key." });
  });

  it("never logs resume or job text", async () => {
    await jobWithTask(user, "score_job");
    await jobWithTask(user, "score_job", "Frontend role with React. FAKE_LLM_UNAVAILABLE makes the fake model busy.");
    await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", log });
    const all = logs.join("\n");
    expect(all).not.toContain("Wonka");
    expect(all).not.toContain("GraphQL and AWS required");
  });

  it("does nothing when the queue is empty", async () => {
    expect(await runWorker({ db: admin, generate: fakeGenerate, workerId: "w1", log })).toEqual({ claimed: 0, done: 0, retrying: 0, failed: 0 });
  });
});
