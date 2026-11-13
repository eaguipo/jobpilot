"use server";

import { revalidatePath } from "next/cache";
import { getDb, getJob, getProfile, updateJob } from "@/lib/db";
import { getLlm, LlmError, type LlmErrorKind } from "@/lib/llm";
import { fakeGenerate, scoreMatch } from "@/lib/match";

export type ScoreState = { status: "idle" } | { status: "scored"; score: number } | { status: "error"; error: string };

const MESSAGES: Record<LlmErrorKind, string> = {
  config: "No Gemini API key. Add GEMINI_API_KEY to .env.local and restart the app.",
  auth: "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.",
  rate_limit: "Gemini's free-tier limit was reached. Wait a minute and try again.",
  unavailable: "Gemini is busy right now. Try again in a minute.",
  blocked: "Gemini declined to score this job.",
  bad_response: "Gemini didn't return a usable score. Try again.",
  network: "Couldn't reach Gemini. Check your connection and try again.",
};

export async function scoreJobAction(_prev: ScoreState, formData: FormData): Promise<ScoreState> {
  const jobId = Number(formData.get("jobId"));
  const db = getDb();
  const job = Number.isInteger(jobId) ? getJob(db, jobId) : null;
  if (!job) return { status: "error", error: "That job no longer exists." };
  const profile = getProfile(db);
  if (!profile) return { status: "error", error: "Add your resume on the Profile page first." };

  try {
    const generate = process.env.JOBPILOT_FAKE_LLM === "1" ? fakeGenerate : getLlm();
    const result = await scoreMatch({ resume: profile.resumeText, job }, generate);
    updateJob(db, job.id, result);
    revalidatePath("/jobs");
    return { status: "scored", score: result.score };
  } catch (e) {
    if (e instanceof LlmError) {
      // Log the kind and our own message only: never the key, resume or job text.
      console.error(`[score] job ${job.id}: ${e.kind}: ${e.message}`);
      return { status: "error", error: MESSAGES[e.kind] };
    }
    throw e;
  }
}
