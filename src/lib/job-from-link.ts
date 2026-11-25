import { fetchJobFromBoard, type BoardErrorKind } from "./job-boards";
import { canonicalJobUrl, parseJobLink, SUPPORTED_BOARDS_HINT } from "./job-link";

/**
 * "Fill from link" (task 22): pasted URL → Add job form values, or a message for the user.
 * The server action adds sign-in and the duplicate check around this.
 */

export interface LinkValues {
  company: string;
  title: string;
  applyUrl: string;
  description: string;
}
export type LinkResult = { ok: true; values: LinkValues } | { ok: false; error: string };

const MESSAGES: Record<BoardErrorKind, string> = {
  not_found: "Couldn't find that posting. It may have closed; check the link opens in your browser.",
  unavailable: "The job board didn't answer in time. Try again in a minute, or paste the details instead.",
  bad_response: "Couldn't read that posting. Paste the details instead.",
};

export async function jobFromLink(input: string, fetchImpl?: typeof fetch): Promise<LinkResult> {
  if (!input.trim()) return { ok: false, error: "Paste a job posting link first." };
  if (input.length > 2_000) return { ok: false, error: "That link is too long." };
  const link = parseJobLink(input);
  if (!link) {
    return { ok: false, error: `Only ${SUPPORTED_BOARDS_HINT} posting links can be read for now. Paste the details instead.` };
  }
  const result = await fetchJobFromBoard(link, fetchImpl);
  if (!result.ok) return { ok: false, error: MESSAGES[result.error] };
  return { ok: true, values: { ...result.job, applyUrl: canonicalJobUrl(link) } };
}
