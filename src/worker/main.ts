/**
 * Worker entry point: `npm run worker`.
 * Env: SUPABASE_URL, SUPABASE_SECRET_KEY, GEMINI_API_KEY (GEMINI_MODEL optional),
 * WORKER_MAX_SECONDS (default 240), WORKER_MAX_TASKS (default 50).
 * JOBPILOT_FAKE_LLM=1 uses the offline fake model (tests).
 */

import { createClient } from "@supabase/supabase-js";
import os from "node:os";
import { getGenerator } from "../lib/ai";
import { runWorker } from "./run";

async function main() {
  const url = process.env.SUPABASE_URL?.trim();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !secret) {
    console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
    process.exit(2);
  }
  const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const workerId = process.env.GITHUB_RUN_ID
    ? `gha-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`
    : `${os.hostname()}-${process.pid}`;

  const summary = await runWorker({
    db,
    generate: getGenerator(),
    workerId,
    maxMillis: Number(process.env.WORKER_MAX_SECONDS ?? 240) * 1000,
    maxTasks: Number(process.env.WORKER_MAX_TASKS ?? 50),
  });

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Worker run\n\n| Claimed | Done | Retrying | Failed |\n|---|---|---|---|\n| ${summary.claimed} | ${summary.done} | ${summary.retrying} | ${summary.failed} |\n`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
