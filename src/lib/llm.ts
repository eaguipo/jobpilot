/**
 * Minimal Gemini client returning structured JSON (task 85).
 * Server-only: reads GEMINI_API_KEY, which must never reach the browser or logs.
 */

export type LlmErrorKind =
  | "config" // no API key
  | "auth" // key rejected
  | "rate_limit" // 429, quota
  | "unavailable" // 5xx, overloaded
  | "blocked" // safety filter
  | "bad_response" // not the JSON we asked for
  | "network"; // timeout, DNS, connection

export class LlmError extends Error {
  constructor(
    public readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Tag names our prompts use to delimit untrusted text. */
const PROMPT_TAGS = ["resume", "job_posting", "gaps"];

/**
 * Wraps untrusted text (resume, job posting) in a tag the prompt refers to,
 * defusing every prompt tag inside the text so it can't end its block early
 * or fake another block (e.g. a posting that contains "<gaps>none</gaps>").
 */
export function fence(text: string, tag: string) {
  const tags = [...new Set([...PROMPT_TAGS, tag])].join("|");
  const safe = text.replace(new RegExp(`<(/?)(${tags})\\b`, "gi"), "‹$1$2");
  return `<${tag}>\n${safe}\n</${tag}>`;
}

export interface JsonRequest {
  system: string;
  prompt: string;
  /** Gemini responseSchema (OpenAPI subset). */
  schema: Record<string, unknown>;
}
export type GenerateJson = (req: JsonRequest) => Promise<unknown>;

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE: LlmErrorKind[] = ["rate_limit", "unavailable", "network"];

export interface GeminiOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
  /** Extra attempts after the first, for busy/rate-limited/network errors. */
  retries?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function geminiClient(opts: GeminiOptions): GenerateJson {
  const {
    apiKey,
    model = DEFAULT_GEMINI_MODEL,
    fetchImpl = fetch,
    retries = 2,
    baseDelayMs = 1_000,
    timeoutMs = 60_000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  if (!apiKey) throw new LlmError("config", "GEMINI_API_KEY is not set.");

  return async ({ system, prompt, schema }) => {
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: schema },
    });

    for (let attempt = 0; ; attempt++) {
      try {
        return await callOnce(fetchImpl, `${API}/${encodeURIComponent(model)}:generateContent`, apiKey, body, timeoutMs);
      } catch (e) {
        const err = e instanceof LlmError ? e : new LlmError("network", "Could not reach Gemini.");
        if (attempt >= retries || !RETRYABLE.includes(err.kind)) throw err;
        await sleep(baseDelayMs * 3 ** attempt);
      }
    }
  };
}

async function callOnce(fetchImpl: typeof fetch, url: string, apiKey: string, body: string, timeoutMs: number) {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      // Key in a header, not the URL, so it can't leak through logged URLs.
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new LlmError("network", "Could not reach Gemini (network error or timeout).");
  }

  const text = await res.text();
  let data: GeminiResponse | undefined;
  try {
    data = JSON.parse(text) as GeminiResponse;
  } catch {
    data = undefined;
  }

  if (!res.ok) {
    const apiMessage = data?.error?.message ?? "";
    if (res.status === 401 || res.status === 403 || /api key/i.test(apiMessage))
      throw new LlmError("auth", "Gemini rejected the API key.");
    if (res.status === 429) throw new LlmError("rate_limit", "Gemini rate limit or quota reached.");
    if (res.status >= 500) throw new LlmError("unavailable", `Gemini is unavailable (HTTP ${res.status}).`);
    throw new LlmError("bad_response", `Gemini returned HTTP ${res.status}.`);
  }
  if (!data) throw new LlmError("bad_response", "Gemini returned a non-JSON response.");

  if (data.promptFeedback?.blockReason) throw new LlmError("blocked", "Gemini blocked the request.");
  const candidate = data.candidates?.[0];
  if (!candidate) throw new LlmError("bad_response", "Gemini returned no answer.");
  if (candidate.finishReason && ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate.finishReason))
    throw new LlmError("blocked", "Gemini blocked the answer.");
  if (candidate.finishReason === "MAX_TOKENS") throw new LlmError("bad_response", "Gemini's answer was cut off.");

  const answer = (candidate.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  try {
    return JSON.parse(answer) as unknown;
  } catch {
    throw new LlmError("bad_response", "Gemini's answer was not valid JSON.");
  }
}

interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

/** The app's client, configured from the environment. */
export function getLlm(): GenerateJson {
  return geminiClient({
    apiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL,
  });
}
