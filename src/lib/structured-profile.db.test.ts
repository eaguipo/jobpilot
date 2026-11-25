import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getProfile, saveProfile, saveStructuredResume } from "./data";
import { takeAiQuota } from "./quota";

/**
 * Story 12: the parsed resume stored on the profile, against the LOCAL Supabase (`npm run test:db`).
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run structured-profile tests against a non-local Supabase: ${url}`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const RESUME = `Jordan Reyes — Frontend Engineer\n${"Built accessible React apps with TypeScript. ".repeat(6)}\nCafé Ñandú, 2020–2024`;
const STRUCTURE = { contact: { name: "Jordan Reyes" }, skills: ["React"] };
let n = 0;

describe.skipIf(!enabled)("structured profile", () => {
  let admin: SupabaseClient;
  const userIds: string[] = [];

  async function signedIn() {
    const email = `structured-${Date.now()}-${n++}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: "test-password-123!", email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const sb = createClient(url!, publishable!, noSession);
    const { error } = await sb.auth.signInWithPassword({ email, password: "test-password-123!" });
    if (error) throw error;
    return { id: created.data.user.id, sb };
  }

  beforeAll(() => {
    admin = createClient(url!, secret!, noSession);
  });
  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("keeps an md5 of the resume that matches Node's, including non-ASCII text", async () => {
    const { id, sb } = await signedIn();
    const saved = await saveProfile(sb, id, RESUME);
    expect(saved.resumeMd5).toBe(md5(RESUME));
    expect(saved.structured).toBeNull();
    expect(saved.structuredFrom).toBeNull();
  });

  it("saves a structure for the current resume without moving 'resume last saved'", async () => {
    const { id, sb } = await signedIn();
    const saved = await saveProfile(sb, id, RESUME);
    expect(await saveStructuredResume(sb, md5(RESUME), STRUCTURE)).toBe(true);
    const p = (await getProfile(sb))!;
    expect(p.structured).toEqual(STRUCTURE);
    expect(p.structuredFrom).toBe(p.resumeMd5);
    expect(p.structuredAt).not.toBeNull();
    expect(p.updatedAt).toBe(saved.updatedAt);
  });

  it("refuses a structure parsed from an older resume, and shows it as out of date after an edit", async () => {
    const { id, sb } = await signedIn();
    await saveProfile(sb, id, RESUME);
    await saveStructuredResume(sb, md5(RESUME), STRUCTURE);

    const edited = `${RESUME}\nNew line added later.`;
    await saveProfile(sb, id, edited);
    // A parse of the old text that finishes after the edit isn't saved.
    expect(await saveStructuredResume(sb, md5(RESUME), { contact: { name: "Old" } })).toBe(false);
    const p = (await getProfile(sb))!;
    expect(p.structured).toEqual(STRUCTURE);
    expect(p.structuredFrom).not.toBe(p.resumeMd5);
  });

  it("only touches the signed-in user's own profile", async () => {
    const a = await signedIn();
    const b = await signedIn();
    await saveProfile(a.sb, a.id, RESUME);
    await saveProfile(b.sb, b.id, RESUME);
    // Same resume text, same hash: b's save must still not reach a's row.
    expect(await saveStructuredResume(b.sb, md5(RESUME), STRUCTURE)).toBe(true);
    expect((await getProfile(a.sb))!.structured).toBeNull();
    expect((await getProfile(b.sb))!.structured).toEqual(STRUCTURE);
  });

  it("rejects a structure that isn't an object, is too large, or comes without its source hash", async () => {
    const { id, sb } = await signedIn();
    await saveProfile(sb, id, RESUME);
    const update = (row: Record<string, unknown>) => sb.from("profiles").update(row).eq("user_id", id);
    const now = new Date().toISOString();
    expect((await update({ structured: ["a"], structured_from: md5(RESUME), structured_at: now })).error?.code).toBe("23514");
    expect((await update({ structured: { x: "y".repeat(100_001) }, structured_from: md5(RESUME), structured_at: now })).error?.code).toBe("23514");
    expect((await update({ structured: STRUCTURE, structured_from: null, structured_at: now })).error?.code).toBe("23514");
    expect((await update({ structured: STRUCTURE, structured_from: "not-a-hash", structured_at: now })).error?.code).toBe("23514");
    // resume_md5 is computed by Postgres and can't be written.
    expect((await update({ resume_md5: md5("something else") })).error).not.toBeNull();
  });

  it("counts a parse as an AI run", async () => {
    const { sb } = await signedIn();
    expect((await takeAiQuota(sb, "parse")).allowed).toBe(true);
    const { data } = await sb.from("ai_usage").select("kind");
    expect(data?.map((r) => r.kind)).toEqual(["parse"]);
  });
});
