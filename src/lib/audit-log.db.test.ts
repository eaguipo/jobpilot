import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Audit log (task 75) against the LOCAL Supabase in Docker (never the cloud project).
 * Entries are written by a trigger on jobs; users can read their own and write nothing.
 * Run with `npm run test:db`. Skipped by `npm test`.
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);

if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run audit log tests against a non-local Supabase: ${url}`);
}

const PASSWORD = "test-password-123!";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
let seq = 0;
const newJob = () => ({
  company: "Acme",
  title: "Frontend Engineer",
  apply_url: `https://jobs.example.com/audit-${Date.now()}-${++seq}`,
  description: "A frontend role building React and TypeScript apps for customers.",
});

describe.skipIf(!enabled)("audit log", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  let aliceId: string;
  let bobId: string;

  async function signedIn(email: string) {
    const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
    const client = createClient(url!, publishable!, noSession);
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw error;
    return { client, id: created.data.user.id };
  }

  async function addJob(client: SupabaseClient): Promise<number> {
    const { data, error } = await client.from("jobs").insert(newJob()).select("id").single();
    if (error) throw error;
    return data.id;
  }

  async function update(client: SupabaseClient, id: number, changes: Record<string, unknown>) {
    const { error } = await client.from("jobs").update(changes).eq("id", id);
    if (error) throw error;
  }

  async function entries(client: SupabaseClient, jobId: number) {
    const { data, error } = await client
      .from("audit_log")
      .select("user_id, job_id, kind, job_company, job_title, detail, document, screenshot_path")
      .eq("job_id", jobId)
      .order("id");
    if (error) throw error;
    return data;
  }

  beforeAll(async () => {
    admin = createClient(url!, secret!, noSession);
    anon = createClient(url!, publishable!, noSession);
    const stamp = Date.now();
    ({ client: alice, id: aliceId } = await signedIn(`audit-alice-${stamp}@example.com`));
    ({ client: bob, id: bobId } = await signedIn(`audit-bob-${stamp}@example.com`));
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of [aliceId, bobId]) if (id) await admin.auth.admin.deleteUser(id);
  });

  describe("recording", () => {
    it("adding a job records nothing (nothing generated yet)", async () => {
      const id = await addJob(alice);
      expect(await entries(alice, id)).toEqual([]);
    });

    it("records a score with its met and gaps lists", async () => {
      const id = await addJob(alice);
      await update(alice, id, { score: 82, met: ["React"], gaps: ["GraphQL"] });
      expect(await entries(alice, id)).toEqual([
        {
          user_id: aliceId,
          job_id: id,
          kind: "match_scored",
          job_company: "Acme",
          job_title: "Frontend Engineer",
          detail: { score: 82, met: ["React"], gaps: ["GraphQL"] },
          document: null,
          screenshot_path: null,
        },
      ]);
    });

    it("records the tailored resume and cover letter text as two entries", async () => {
      const id = await addJob(alice);
      await update(alice, id, { tailored_resume: "Resume v1", cover_letter: "Letter v1" });
      const rows = await entries(alice, id);
      expect(rows.map((r) => [r.kind, r.document])).toEqual([
        ["resume_tailored", "Resume v1"],
        ["cover_letter_written", "Letter v1"],
      ]);
    });

    it("records each regeneration, keeping earlier versions", async () => {
      const id = await addJob(alice);
      await update(alice, id, { tailored_resume: "Resume v1" });
      await update(alice, id, { tailored_resume: "Resume v2" });
      expect((await entries(alice, id)).map((r) => r.document)).toEqual(["Resume v1", "Resume v2"]);
    });

    it("skips unchanged values, cleared values and unrelated updates", async () => {
      const id = await addJob(alice);
      await update(alice, id, { score: 70, tailored_resume: "Resume v1" });
      await update(alice, id, { score: 70, tailored_resume: "Resume v1" }); // same values
      await update(alice, id, { status: "Applied" }); // not a generation
      await update(alice, id, { score: null, tailored_resume: null }); // cleared
      expect((await entries(alice, id)).map((r) => r.kind)).toEqual(["match_scored", "resume_tailored"]);
    });

    it("keeps entries after the job is deleted, with company and title intact", async () => {
      const id = await addJob(alice);
      await update(alice, id, { score: 55 });
      const { data: before } = await alice.from("audit_log").select("id").eq("job_id", id).single();
      const del = await alice.from("jobs").delete().eq("id", id);
      expect(del.error).toBeNull();

      const { data: after, error } = await alice
        .from("audit_log")
        .select("job_id, kind, job_company, job_title")
        .eq("id", before!.id)
        .single();
      expect(error).toBeNull();
      expect(after).toEqual({ job_id: null, kind: "match_scored", job_company: "Acme", job_title: "Frontend Engineer" });
    });
  });

  describe("access", () => {
    let aliceJob: number;
    let aliceEntryId: number;

    beforeAll(async () => {
      aliceJob = await addJob(alice);
      await update(alice, aliceJob, { score: 90 });
      const { data, error } = await alice.from("audit_log").select("id").eq("job_id", aliceJob).single();
      if (error) throw error;
      aliceEntryId = data.id;
    });

    it("other users can't see someone else's entries", async () => {
      expect(await entries(bob, aliceJob)).toEqual([]);
      const { data } = await bob.from("audit_log").select("id").eq("user_id", aliceId);
      expect(data).toEqual([]);
    });

    it("signed-out requests are refused", async () => {
      const { error } = await anon.from("audit_log").select("id");
      expect(error?.code).toBe("42501");
    });

    it("users can't insert entries, even for themselves", async () => {
      const { error } = await alice.from("audit_log").insert({
        user_id: aliceId,
        job_id: aliceJob,
        kind: "application_submitted",
        job_company: "Acme",
        job_title: "Forged",
      });
      expect(error?.code).toBe("42501");
    });

    it("users can't edit or delete their own entries", async () => {
      const edit = await alice.from("audit_log").update({ document: "tampered" }).eq("id", aliceEntryId);
      expect(edit.error?.code).toBe("42501");
      const del = await alice.from("audit_log").delete().eq("id", aliceEntryId);
      expect(del.error?.code).toBe("42501");

      const { data } = await alice.from("audit_log").select("id, document").eq("id", aliceEntryId).single();
      expect(data).toEqual({ id: aliceEntryId, document: null });
    });

    it("users can't call the trigger function directly", async () => {
      const { error } = await alice.rpc("jobs_record_audit");
      expect(error).not.toBeNull();
    });
  });
});
