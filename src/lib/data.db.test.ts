import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addJob,
  countJobsByStatus,
  DataError,
  deleteJob,
  findJobByApplyUrl,
  getAuditEntry,
  getJob,
  getProfile,
  listAuditLog,
  listJobs,
  listStatusEvents,
  listStatusEventsByJob,
  saveProfile,
  updateJob,
} from "./data";

/**
 * The app's data layer against the LOCAL Supabase (`npm run test:db`), as real signed-in users.
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run data tests against a non-local Supabase: ${url}`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const RESUME = "Jane Doe — Frontend Engineer. " + "Built React and TypeScript apps at Acme. ".repeat(8);
let n = 0;
const newJob = (company = "Acme") => ({
  company,
  title: "Frontend Engineer",
  applyUrl: `https://jobs.example.com/d-${Date.now()}-${n++}`,
  description: "A frontend role building React and TypeScript apps for customers.",
});

describe.skipIf(!enabled)("data layer on Supabase", () => {
  let admin: SupabaseClient;
  const users: { id: string; sb: SupabaseClient }[] = [];

  async function signedIn() {
    const email = `data-${Date.now()}-${n++}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: "test-password-123!", email_confirm: true });
    if (created.error) throw created.error;
    const sb = createClient(url!, publishable!, noSession);
    const { error } = await sb.auth.signInWithPassword({ email, password: "test-password-123!" });
    if (error) throw error;
    const user = { id: created.data.user.id, sb };
    users.push(user);
    return user;
  }

  beforeAll(() => {
    admin = createClient(url!, secret!, noSession);
  });
  afterAll(async () => {
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
  });

  describe("profile", () => {
    it("is empty for a new user, then saves and replaces the resume", async () => {
      const { id, sb } = await signedIn();
      expect(await getProfile(sb)).toBeNull();
      const first = await saveProfile(sb, id, RESUME);
      expect(first.resumeText).toBe(RESUME);
      await saveProfile(sb, id, RESUME + " Updated.");
      expect((await getProfile(sb))?.resumeText).toBe(RESUME + " Updated.");
    });

    it("can't be saved for another user", async () => {
      const a = await signedIn();
      const b = await signedIn();
      await expect(saveProfile(b.sb, a.id, RESUME)).rejects.toMatchObject({ code: "42501" });
      expect(await getProfile(a.sb)).toBeNull();
    });
  });

  describe("jobs", () => {
    it("adds a job and reads it back with every field mapped", async () => {
      const { sb } = await signedIn();
      const input = newJob();
      const job = await addJob(sb, input);
      expect(job).toMatchObject({ ...input, status: "Matched", score: null, met: [], gaps: [], tailoredResume: null, coverLetter: null });
      expect(await getJob(sb, job.id)).toEqual(job);
      expect((await findJobByApplyUrl(sb, input.applyUrl))?.id).toBe(job.id);
    });

    it("refuses the same link twice for one user with code 23505, but allows it for another user", async () => {
      const a = await signedIn();
      const b = await signedIn();
      const input = newJob();
      await addJob(a.sb, input);
      const dup = addJob(a.sb, input);
      await expect(dup).rejects.toBeInstanceOf(DataError);
      await expect(dup).rejects.toMatchObject({ code: "23505" });
      await expect(addJob(b.sb, input)).resolves.toMatchObject({ applyUrl: input.applyUrl });
    });

    it("lists newest first and filters by status", async () => {
      const { sb } = await signedIn();
      const first = await addJob(sb, newJob("First"));
      const second = await addJob(sb, newJob("Second"));
      await updateJob(sb, first.id, { status: "Applied" });
      expect((await listJobs(sb)).map((j) => j.company)).toEqual(["Second", "First"]);
      expect((await listJobs(sb, { status: "Applied" })).map((j) => j.id)).toEqual([first.id]);
      expect(await countJobsByStatus(sb)).toEqual({ Matched: 1, Applied: 1, Interviewing: 0, Offer: 0, Rejected: 0 });
      expect(second.status).toBe("Matched");
    });

    it("saves score, lists and documents", async () => {
      const { sb } = await signedIn();
      const { id } = await addJob(sb, newJob());
      const updated = await updateJob(sb, id, {
        score: 82,
        met: ["React — 5 years"],
        gaps: ["GraphQL"],
        tailoredResume: "Tailored resume",
        coverLetter: "Dear Hiring Manager,",
      });
      expect(updated).toMatchObject({ score: 82, met: ["React — 5 years"], gaps: ["GraphQL"], tailoredResume: "Tailored resume" });
      expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(updated!.createdAt).getTime());
    });

    it("records status history through the database trigger", async () => {
      const { sb } = await signedIn();
      const { id } = await addJob(sb, newJob());
      await updateJob(sb, id, { status: "Applied" });
      await updateJob(sb, id, { score: 50 }); // not a status change
      await updateJob(sb, id, { status: "Interviewing" });
      expect((await listStatusEvents(sb, id)).map((e) => [e.fromStatus, e.toStatus])).toEqual([
        ["Applied", "Interviewing"],
        ["Matched", "Applied"],
        [null, "Matched"],
      ]);
      expect((await listStatusEventsByJob(sb)).get(id)).toHaveLength(3);
    });

    it("rejects an invalid status from the database", async () => {
      const { sb } = await signedIn();
      const { id } = await addJob(sb, newJob());
      await expect(updateJob(sb, id, { status: "Ghosted" as never })).rejects.toMatchObject({ code: "23514" });
    });

    it("deletes a job with its history", async () => {
      const { sb } = await signedIn();
      const { id } = await addJob(sb, newJob());
      expect(await deleteJob(sb, id)).toBe(true);
      expect(await getJob(sb, id)).toBeNull();
      expect(await listStatusEvents(sb, id)).toEqual([]);
      expect(await deleteJob(sb, id)).toBe(false);
    });
  });

  describe("audit log", () => {
    it("lists generated items newest first, without the document text", async () => {
      const { sb } = await signedIn();
      const job = await addJob(sb, newJob("Globex"));
      await updateJob(sb, job.id, { score: 77, met: ["React"], gaps: ["Go"] });
      await updateJob(sb, job.id, { tailoredResume: "Tailored resume", coverLetter: "Dear Globex" });

      const entries = await listAuditLog(sb);
      expect(entries.map((e) => e.kind)).toEqual(["cover_letter_written", "resume_tailored", "match_scored"]);
      expect(entries[2]).toMatchObject({
        jobId: job.id,
        jobCompany: "Globex",
        jobTitle: "Frontend Engineer",
        detail: { score: 77, met: ["React"], gaps: ["Go"] },
        screenshotPath: null,
      });
      expect(entries[0]).not.toHaveProperty("document");
    });

    it("pages with limit and beforeId", async () => {
      const { sb } = await signedIn();
      const job = await addJob(sb, newJob());
      for (const score of [10, 20, 30]) await updateJob(sb, job.id, { score });

      const first = await listAuditLog(sb, { limit: 2 });
      expect(first.map((e) => e.detail.score)).toEqual([30, 20]);
      const next = await listAuditLog(sb, { limit: 2, beforeId: first[1].id });
      expect(next.map((e) => e.detail.score)).toEqual([10]);
      expect(await listAuditLog(sb, { limit: 2, beforeId: next[0].id })).toEqual([]);
    });

    it("loads one entry with its document; other users get null", async () => {
      const a = await signedIn();
      const b = await signedIn();
      const job = await addJob(a.sb, newJob());
      await updateJob(a.sb, job.id, { coverLetter: "Dear hiring team" });
      const [entry] = await listAuditLog(a.sb);

      expect(await getAuditEntry(a.sb, entry.id)).toMatchObject({ kind: "cover_letter_written", document: "Dear hiring team" });
      expect(await getAuditEntry(b.sb, entry.id)).toBeNull();
      expect(await getAuditEntry(a.sb, 999_999_999)).toBeNull();
    });
  });

  describe("users are isolated", () => {
    it("another user can't see, change or delete your jobs, profile or history", async () => {
      const a = await signedIn();
      const b = await signedIn();
      await saveProfile(a.sb, a.id, RESUME);
      const job = await addJob(a.sb, newJob());

      expect(await getProfile(b.sb)).toBeNull();
      expect(await getJob(b.sb, job.id)).toBeNull();
      expect(await findJobByApplyUrl(b.sb, job.applyUrl)).toBeNull();
      expect(await listJobs(b.sb)).toEqual([]);
      expect(await countJobsByStatus(b.sb)).toEqual({ Matched: 0, Applied: 0, Interviewing: 0, Offer: 0, Rejected: 0 });
      expect((await listStatusEventsByJob(b.sb)).size).toBe(0);
      expect(await listAuditLog(b.sb)).toEqual([]);

      expect(await updateJob(b.sb, job.id, { status: "Rejected" })).toBeNull();
      expect(await deleteJob(b.sb, job.id)).toBe(false);
      expect((await getJob(a.sb, job.id))?.status).toBe("Matched");
    });
  });
});
