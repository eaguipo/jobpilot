import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getAiQuota, takeAiQuota } from "./quota";

/**
 * AI usage limits (task 74) against the LOCAL Supabase (`npm run test:db`).
 */
const url = process.env.API_URL;
const publishable = process.env.PUBLISHABLE_KEY ?? process.env.ANON_KEY;
const secret = process.env.SECRET_KEY ?? process.env.SERVICE_ROLE_KEY;
const enabled = !!(process.env.SUPABASE_DB_TEST && url && publishable && secret);
if (enabled && !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url!)) {
  throw new Error(`Refusing to run quota tests against a non-local Supabase: ${url}`);
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
let n = 0;

describe.skipIf(!enabled)("AI usage limits", () => {
  let admin: SupabaseClient;
  const userIds: string[] = [];

  async function signedIn() {
    const email = `quota-${Date.now()}-${n++}@example.com`;
    const created = await admin.auth.admin.createUser({ email, password: "test-password-123!", email_confirm: true });
    if (created.error) throw created.error;
    userIds.push(created.data.user.id);
    const sb = createClient(url!, publishable!, noSession);
    const { error } = await sb.auth.signInWithPassword({ email, password: "test-password-123!" });
    if (error) throw error;
    return { id: created.data.user.id, sb };
  }
  const setLimits = async (perDay: number, perMinute: number) => {
    const { error } = await admin.from("ai_limits").update({ per_day: perDay, per_minute: perMinute }).eq("id", true);
    if (error) throw error;
  };

  beforeAll(() => {
    admin = createClient(url!, secret!, noSession);
  });
  afterEach(() => setLimits(50, 10)); // the migration's defaults
  afterAll(async () => {
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  });

  it("allows a run, records it and counts it toward today", async () => {
    const { sb } = await signedIn();
    expect(await getAiQuota(sb)).toEqual({ usedToday: 0, perDay: 50 });
    expect(await takeAiQuota(sb, "score")).toEqual({ allowed: true, reason: null, usedToday: 1, perDay: 50, retryAfterSeconds: 0 });
    await takeAiQuota(sb, "tailor");
    expect(await getAiQuota(sb)).toEqual({ usedToday: 2, perDay: 50 });
    const { data } = await sb.from("ai_usage").select("kind");
    expect(data?.map((r) => r.kind).sort()).toEqual(["score", "tailor"]);
  });

  it("stops a user at the daily limit, without affecting anyone else", async () => {
    await setLimits(3, 10);
    const a = await signedIn();
    const b = await signedIn();
    for (let i = 0; i < 3; i++) expect((await takeAiQuota(a.sb, "score")).allowed).toBe(true);
    const blocked = await takeAiQuota(a.sb, "tailor");
    expect(blocked).toMatchObject({ allowed: false, reason: "daily", usedToday: 3, perDay: 3 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(24 * 3600);
    expect(await getAiQuota(a.sb)).toEqual({ usedToday: 3, perDay: 3 }); // the refused run isn't counted
    expect((await takeAiQuota(b.sb, "score")).allowed).toBe(true);
  });

  it("rate-limits bursts per minute", async () => {
    await setLimits(50, 2);
    const { sb } = await signedIn();
    await takeAiQuota(sb, "score");
    await takeAiQuota(sb, "score");
    const blocked = await takeAiQuota(sb, "score");
    expect(blocked).toMatchObject({ allowed: false, reason: "rate", usedToday: 2 });
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("lets exactly the allowed number through when clicks arrive at the same time", async () => {
    await setLimits(200, 4);
    const { sb } = await signedIn();
    const results = await Promise.all(Array.from({ length: 40 }, () => takeAiQuota(sb, "score")));
    expect(results.filter((r) => r.allowed)).toHaveLength(4);
    expect(await getAiQuota(sb)).toMatchObject({ usedToday: 4 });
  });

  it("can't be reset or bypassed by the user", async () => {
    const { id, sb } = await signedIn();
    await takeAiQuota(sb, "score");

    const insert = await sb.from("ai_usage").insert({ user_id: id, kind: "score" });
    expect(insert.error?.code).toBe("42501");
    const del = await sb.from("ai_usage").delete().eq("user_id", id);
    expect(del.error?.code).toBe("42501");
    const limits = await sb.from("ai_limits").update({ per_day: 9999 }).eq("id", true).select();
    expect(limits.error?.code).toBe("42501");
    expect(await getAiQuota(sb)).toEqual({ usedToday: 1, perDay: 50 });

    await expect(takeAiQuota(sb, "nonsense" as never)).rejects.toMatchObject({ code: "22023" });
  });

  it("users only see their own usage, and signed-out visitors can't use or read it", async () => {
    const a = await signedIn();
    const b = await signedIn();
    await takeAiQuota(a.sb, "score");
    expect((await b.sb.from("ai_usage").select("id")).data).toEqual([]);

    const anon = createClient(url!, publishable!, noSession);
    expect((await anon.rpc("use_ai_quota", { p_kind: "score" })).error?.code).toBe("42501");
    expect((await anon.rpc("ai_quota_status")).error?.code).toBe("42501");
    expect((await anon.from("ai_usage").select("id")).error?.code).toBe("42501");
  });
});
