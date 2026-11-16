/**
 * AI usage limits (task 74). The rules live in the database (use_ai_quota in
 * supabase/migrations/20261117000000_ai_quota.sql) so they hold across servers and
 * can't be bypassed from the browser; this file calls them and words the answer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DataError } from "./data";

export type AiKind = "score" | "tailor";

export interface QuotaResult {
  allowed: boolean;
  reason: "daily" | "rate" | null;
  usedToday: number;
  perDay: number;
  retryAfterSeconds: number;
}

interface QuotaRow {
  allowed: boolean;
  reason: "daily" | "rate" | null;
  used_today: number;
  per_day: number;
  retry_after_seconds: number;
}

/** Checks the signed-in user's limits and, if allowed, records one AI run. */
export async function takeAiQuota(sb: SupabaseClient, kind: AiKind): Promise<QuotaResult> {
  const { data, error } = await sb.rpc("use_ai_quota", { p_kind: kind });
  if (error) throw new DataError(`Checking your AI limit failed: ${error.message}`, error.code);
  const r = data as QuotaRow;
  return {
    allowed: r.allowed,
    reason: r.reason,
    usedToday: r.used_today,
    perDay: r.per_day,
    retryAfterSeconds: r.retry_after_seconds,
  };
}

/** Runs used today and the daily allowance. */
export async function getAiQuota(sb: SupabaseClient): Promise<{ usedToday: number; perDay: number }> {
  const { data, error } = await sb.rpc("ai_quota_status");
  if (error) throw new DataError(`Loading your AI limit failed: ${error.message}`, error.code);
  const r = data as { used_today: number; per_day: number };
  return { usedToday: r.used_today, perDay: r.per_day };
}

/** Plain-language message when a run isn't allowed. */
export function quotaMessage(q: Pick<QuotaResult, "reason" | "perDay" | "retryAfterSeconds">): string {
  if (q.reason === "daily") {
    const hours = Math.max(1, Math.ceil(q.retryAfterSeconds / 3600));
    return `You've used all ${q.perDay} AI runs for today. It resets in about ${hours} hour${hours === 1 ? "" : "s"} (midnight UTC).`;
  }
  const s = Math.max(1, q.retryAfterSeconds);
  return `Too many AI runs in a row. Try again in ${s} second${s === 1 ? "" : "s"}.`;
}
