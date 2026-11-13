/** Validation for the master resume (task 83). Kept pure so it is easy to test. */

export const RESUME_MIN_CHARS = 200;
export const RESUME_MAX_CHARS = 50_000;

export type ResumeCheck = { ok: true; text: string } | { ok: false; error: string };

export function checkResume(input: unknown): ResumeCheck {
  if (typeof input !== "string") return { ok: false, error: "Paste your resume as text." };
  // Normalise line endings and trailing spaces; keep the user's own layout otherwise.
  const text = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  if (text.length === 0) return { ok: false, error: "Paste your resume before saving." };
  if (text.length < RESUME_MIN_CHARS)
    return {
      ok: false,
      error: `That looks too short for a resume (${text.length} characters, at least ${RESUME_MIN_CHARS} needed).`,
    };
  if (text.length > RESUME_MAX_CHARS)
    return {
      ok: false,
      error: `That is longer than ${RESUME_MAX_CHARS.toLocaleString("en-US")} characters. Remove anything that isn't part of your resume.`,
    };
  return { ok: true, text };
}
