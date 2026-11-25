import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Resume file bucket and its policies (story 11) against the LOCAL Supabase (`npm run test:db`).
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run resume file tests against a non-local Supabase: ${url}`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const pdfBytes = new TextEncoder().encode("%PDF-1.4\n% test file\n");
let n = 0;

describe.skipIf(!enabled)("resumes bucket", () => {
  let admin: SupabaseClient;
  const userIds: string[] = [];

  async function signedIn() {
    const email = `files-${Date.now()}-${n++}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: "test-password-123!", email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const sb = createClient(url!, publishable!, noSession);
    const { error } = await sb.auth.signInWithPassword({ email, password: "test-password-123!" });
    if (error) throw error;
    return { id: created.data.user.id, sb };
  }
  const upload = (sb: SupabaseClient, path: string, body: Uint8Array = pdfBytes, contentType = PDF) =>
    sb.storage.from("resumes").upload(path, body, { contentType, upsert: true });

  beforeAll(() => {
    admin = createClient(url!, secret!, noSession);
  });
  afterAll(async () => {
    for (const id of userIds) {
      await admin.storage.from("resumes").remove([`${id}/resume.pdf`, `${id}/resume.docx`]);
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("is private, 5 MB, PDF and DOCX only", async () => {
    const { data, error } = await admin.storage.getBucket("resumes");
    expect(error).toBeNull();
    expect(data).toMatchObject({ public: false, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: [PDF, DOCX] });
  });

  it("lets a user upload, replace, read and delete their own resume", async () => {
    const { id, sb } = await signedIn();
    expect((await upload(sb, `${id}/resume.pdf`)).error).toBeNull();
    expect((await upload(sb, `${id}/resume.pdf`, new TextEncoder().encode("%PDF-1.7\nnewer"))).error).toBeNull();
    expect((await upload(sb, `${id}/resume.docx`, new Uint8Array([0x50, 0x4b, 3, 4]), DOCX)).error).toBeNull();

    const { data } = await sb.storage.from("resumes").download(`${id}/resume.pdf`);
    expect(await data?.text()).toBe("%PDF-1.7\nnewer");
    const list = await sb.storage.from("resumes").list(id);
    expect(list.data?.map((f) => f.name).sort()).toEqual(["resume.docx", "resume.pdf"]);

    expect((await sb.storage.from("resumes").remove([`${id}/resume.docx`])).data).toHaveLength(1);
  });

  it("allows only resume.pdf and resume.docx in the user's own folder", async () => {
    const { id, sb } = await signedIn();
    for (const path of [`${id}/other.pdf`, `${id}/sub/resume.pdf`, `${id}/resume.PDF`, "resume.pdf", `${id}-x/resume.pdf`]) {
      expect((await upload(sb, path)).error, path).not.toBeNull();
    }
  });

  it("keeps each user's file away from everyone else", async () => {
    const a = await signedIn();
    const b = await signedIn();
    expect((await upload(a.sb, `${a.id}/resume.pdf`)).error).toBeNull();

    expect((await b.sb.storage.from("resumes").download(`${a.id}/resume.pdf`)).data).toBeNull();
    expect((await b.sb.storage.from("resumes").list(a.id)).data).toEqual([]);
    expect((await upload(b.sb, `${a.id}/resume.pdf`, new TextEncoder().encode("%PDF-1.4 forged"))).error).not.toBeNull();
    expect((await b.sb.storage.from("resumes").remove([`${a.id}/resume.pdf`])).data).toEqual([]);

    const { data } = await a.sb.storage.from("resumes").download(`${a.id}/resume.pdf`);
    expect(await data?.text()).toBe("%PDF-1.4\n% test file\n");
  });

  it("gives signed-out visitors nothing", async () => {
    const a = await signedIn();
    await upload(a.sb, `${a.id}/resume.pdf`);
    const anon = createClient(url!, publishable!, noSession);
    expect((await anon.storage.from("resumes").download(`${a.id}/resume.pdf`)).data).toBeNull();
    expect((await anon.storage.from("resumes").upload(`${a.id}/resume.pdf`, pdfBytes, { contentType: PDF, upsert: true })).error).not.toBeNull();
  });

  it("refuses other file types and files over 5 MB", async () => {
    const { id, sb } = await signedIn();
    expect((await upload(sb, `${id}/resume.pdf`, pdfBytes, "text/html")).error).not.toBeNull();
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect((await upload(sb, `${id}/resume.pdf`, big)).error).not.toBeNull();
  });
});
