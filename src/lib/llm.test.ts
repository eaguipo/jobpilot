import { describe, expect, it, vi } from "vitest";
import { geminiClient, LlmError } from "./llm";

const KEY = "test-key-123";
const req = { system: "sys", prompt: "hello", schema: { type: "OBJECT" } };

const ok = (text: string, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }], ...extra }), { status: 200 });
const fail = (status: number, message = "nope") => new Response(JSON.stringify({ error: { message } }), { status });

function client(responses: (Response | Error)[], retries = 2) {
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(async () => {});
  return { generate: geminiClient({ apiKey: KEY, fetchImpl, sleep, retries }), fetchImpl, sleep };
}

async function kindOf(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(LlmError);
    expect((e as Error).message).not.toContain(KEY);
    return (e as LlmError).kind;
  }
  throw new Error("expected an error");
}

describe("geminiClient", () => {
  it("sends the key in a header (not the URL) and asks for schema-shaped JSON", async () => {
    const { generate, fetchImpl } = client([ok('{"a":1}')]);
    await expect(generate(req)).resolves.toEqual({ a: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.contents[0].parts[0].text).toBe("hello");
    expect(body.generationConfig).toMatchObject({ temperature: 0, responseMimeType: "application/json", responseSchema: req.schema });
  });

  it("ignores thought parts when reading the answer", async () => {
    const res = new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"ok":true}' }] } }] }),
    );
    const { generate } = client([res]);
    await expect(generate(req)).resolves.toEqual({ ok: true });
  });

  it("retries busy and rate-limited responses with backoff, then succeeds", async () => {
    const { generate, fetchImpl, sleep } = client([fail(503), fail(429), ok('{"done":1}')]);
    await expect(generate(req)).resolves.toEqual({ done: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[1000], [3000]]);
  });

  it("gives up after the retry limit", async () => {
    const { generate, fetchImpl } = client([fail(503), fail(503), fail(503)]);
    expect(await kindOf(generate(req))).toBe("unavailable");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a rejected key", async () => {
    const { generate, fetchImpl } = client([fail(400, "API key not valid. Please pass a valid API key.")]);
    expect(await kindOf(generate(req))).toBe("auth");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["403", () => fail(403), "auth"],
    ["400 other", () => fail(400, "bad schema"), "bad_response"],
    ["network error", () => new TypeError("fetch failed"), "network"],
    ["blocked prompt", () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })), "blocked"],
    ["safety stop", () => new Response(JSON.stringify({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })), "blocked"],
    ["cut off", () => new Response(JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"a"' }] } }] })), "bad_response"],
    ["not JSON", () => ok("Sure! Here is the score: 80"), "bad_response"],
    ["no candidates", () => new Response(JSON.stringify({ candidates: [] })), "bad_response"],
    ["HTML error page", () => new Response("<html>oops</html>", { status: 502 }), "unavailable"],
  ] as const)("maps %s to %s", async (_name, make, kind) => {
    const { generate } = client([make(), make(), make()], 0);
    expect(await kindOf(generate(req))).toBe(kind);
  });

  it("refuses to start without a key", () => {
    expect(() => geminiClient({ apiKey: "" })).toThrow(LlmError);
  });
});
