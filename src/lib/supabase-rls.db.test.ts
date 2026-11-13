import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Row-level security tests against the LOCAL Supabase in Docker (never the cloud project).
 * Run with `npm run test:db` (starts nothing; needs `supabase start`). Skipped by `npm test`.
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);

if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run RLS tests against a non-local Supabase: ${url}`);
}

const PASSWORD = "test-password-123!";
const job = (n: number, extra: Record<string, unknown> = {}) => ({
  company: `Company ${n}`,
  title: "Frontend Engineer",
  apply_url: `https://jobs.example.com/${n}`,
  description: "A frontend role building React and TypeScript apps for customers.",
  ...extra,
});
const resume = "Jane Doe — Frontend Engineer. " + "Built React apps at Acme. ".repeat(10);

describe.skipIf(!enabled)("Supabase row-level security", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId: string;
  let bobId: string;
  let aliceJobId: number;

  async function signedIn(email: string) {
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
    const client = createClient(url!, publishable!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return { client, id: created.data.user.id };
  }

  beforeAll(async () => {
    admin = createClient(url!, secret!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(url!, publishable!, { auth: { persistSession: false, autoRefreshToken: false } });
    const stamp = Date.now();
    ({ client: alice, id: aliceId } = await signedIn(`alice-${stamp}@example.com`));
    ({ client: bob, id: bobId } = await signedIn(`bob-${stamp}@example.com`));

    const { data, error } = await alice.from("jobs").insert(job(1)).select("id").single();
    if (error) throw error;
    aliceJobId = data.id;
    const p = await alice.from("profiles").insert({ resume_text: resume });
    if (p.error) throw p.error;
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [aliceId, bobId]) if (id) await admin.auth.admin.deleteUser(id);
  });

  describe("owners", () => {
    it("can read their own job, with user_id filled in from the session", async () => {
      const { data, error } = await alice.from("jobs").select("id, user_id, status").eq("id", aliceJobId).single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ id: aliceJobId, user_id: aliceId, status: "Matched" });
    });

    it("can read their own profile", async () => {
      const { data } = await alice.from("profiles").select("user_id").single();
      expect(data?.user_id).toBe(aliceId);
    });
  });

  describe("other users", () => {
    it("can't see the job or profile", async () => {
      expect((await bob.from("jobs").select("id").eq("id", aliceJobId)).data).toEqual([]);
      expect((await bob.from("jobs").select("id")).data).toEqual([]);
      expect((await bob.from("profiles").select("user_id")).data).toEqual([]);
      expect((await bob.from("status_events").select("id")).data).toEqual([]);
    });

    it("can't update or delete the job (0 rows affected)", async () => {
      const upd = await bob.from("jobs").update({ status: "Rejected" }).eq("id", aliceJobId).select();
      expect(upd.data).toEqual([]);
      const del = await bob.from("jobs").delete().eq("id", aliceJobId).select();
      expect(del.data).toEqual([]);
      const still = await alice.from("jobs").select("status").eq("id", aliceJobId).single();
      expect(still.data?.status).toBe("Matched");
    });

    it("can't create a row owned by someone else", async () => {
      const { error } = await bob.from("jobs").insert(job(2, { user_id: aliceId }));
      expect(error?.code).toBe("42501"); // RLS violation
      const p = await bob.from("profiles").insert({ user_id: aliceId, resume_text: resume });
      expect(p.error?.code).toBe("42501");
    });

    it("can't take over a job by changing its owner", async () => {
      const { data: own } = await bob.from("jobs").insert(job(3)).select("id").single();
      const { error } = await bob.from("jobs").update({ user_id: aliceId }).eq("id", own!.id);
      expect(error).not.toBeNull();
      expect((await alice.from("jobs").select("id").eq("id", own!.id)).data).toEqual([]);
    });
  });

  describe("signed-out requests", () => {
    it("get no access at all", async () => {
      for (const table of ["jobs", "profiles", "status_events"]) {
        const { data, error } = await anon.from(table).select("*");
        expect(error ?? (data && data.length === 0 ? "empty" : null), table).toBeTruthy();
      }
      const ins = await anon.from("jobs").insert(job(4));
      expect(ins.error).not.toBeNull();
    });
  });

  describe("status history", () => {
    it("is written by triggers on insert and on real status changes only", async () => {
      const { data: j } = await alice.from("jobs").insert(job(5)).select("id").single();
      await alice.from("jobs").update({ status: "Applied" }).eq("id", j!.id);
      await alice.from("jobs").update({ status: "Applied" }).eq("id", j!.id); // no change
      await alice.from("jobs").update({ score: 70 }).eq("id", j!.id); // not a status change
      await alice.from("jobs").update({ status: "Interviewing" }).eq("id", j!.id);
      const { data } = await alice
        .from("status_events")
        .select("from_status, to_status, user_id")
        .eq("job_id", j!.id)
        .order("id", { ascending: false });
      expect(data).toEqual([
        { from_status: "Applied", to_status: "Interviewing", user_id: aliceId },
        { from_status: "Matched", to_status: "Applied", user_id: aliceId },
        { from_status: null, to_status: "Matched", user_id: aliceId },
      ]);
    });

    it("can't be forged, edited or deleted by users", async () => {
      const forged = await alice
        .from("status_events")
        .insert({ job_id: aliceJobId, user_id: aliceId, from_status: "Matched", to_status: "Offer" });
      expect(forged.error).not.toBeNull();
      const edited = await alice.from("status_events").update({ to_status: "Offer" }).eq("job_id", aliceJobId).select();
      expect(edited.error ?? (edited.data?.length === 0 ? "none" : null)).toBeTruthy();
      const deleted = await alice.from("status_events").delete().eq("job_id", aliceJobId).select();
      expect(deleted.error ?? (deleted.data?.length === 0 ? "none" : null)).toBeTruthy();
      const { count } = await alice.from("status_events").select("id", { count: "exact", head: true }).eq("job_id", aliceJobId);
      expect(count).toBe(1);
    });
  });

  describe("constraints", () => {
    it("reject unsafe links, unknown statuses and out-of-range scores", async () => {
      expect((await alice.from("jobs").insert(job(6, { apply_url: "javascript:alert(1)" }))).error?.code).toBe("23514");
      expect((await alice.from("jobs").update({ status: "Ghosted" }).eq("id", aliceJobId)).error?.code).toBe("23514");
      expect((await alice.from("jobs").update({ score: 140 }).eq("id", aliceJobId)).error?.code).toBe("23514");
    });

    it("allow one job per link per user, but the same link for different users", async () => {
      expect((await alice.from("jobs").insert(job(1))).error?.code).toBe("23505");
      expect((await bob.from("jobs").insert(job(1))).error).toBeNull();
    });
  });

  describe("account deletion", () => {
    it("removes the user's jobs, profile and history", async () => {
      const temp = await signedIn(`temp-${Date.now()}@example.com`);
      const { data: j } = await temp.client.from("jobs").insert(job(7)).select("id").single();
      await temp.client.from("profiles").insert({ resume_text: resume });
      await admin.auth.admin.deleteUser(temp.id);
      expect((await admin.from("jobs").select("id").eq("id", j!.id)).data).toEqual([]);
      expect((await admin.from("profiles").select("user_id").eq("user_id", temp.id)).data).toEqual([]);
      expect((await admin.from("status_events").select("id").eq("job_id", j!.id)).data).toEqual([]);
    });
  });
});
