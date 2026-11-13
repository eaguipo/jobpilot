/** App-level wiring for the model: real Gemini, or the offline fake in tests. */

import { fakeGenerate } from "./fake-llm";
import { getLlm, type GenerateJson, type LlmErrorKind } from "./llm";

export function getGenerator(): GenerateJson {
  return process.env.JOBPILOT_FAKE_LLM === "1" ? fakeGenerate : getLlm();
}

/** Plain-language message for the user. `action` completes "Gemini declined to …". */
export function llmErrorMessage(kind: LlmErrorKind, action: string): string {
  switch (kind) {
    case "config":
      return "No Gemini API key. Add GEMINI_API_KEY to .env.local and restart the app.";
    case "auth":
      return "Gemini rejected the API key. Check GEMINI_API_KEY in .env.local.";
    case "rate_limit":
      return "Gemini's free-tier limit was reached. Wait a minute and try again.";
    case "unavailable":
      return "Gemini is busy right now. Try again in a minute.";
    case "blocked":
      return `Gemini declined to ${action}.`;
    case "bad_response":
      return "Gemini didn't return a usable answer. Try again.";
    case "network":
      return "Couldn't reach Gemini. Check your connection and try again.";
  }
}
