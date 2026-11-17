import { describe, expect, it } from "vitest";
import { quotaMessage } from "./quota";

describe("quotaMessage", () => {
  it("explains the daily limit and roughly when it resets", () => {
    expect(quotaMessage({ reason: "daily", perDay: 50, retryAfterSeconds: 5 * 3600 - 10 })).toBe(
      "You've used all 50 AI runs for today. It resets in about 5 hours (midnight UTC).",
    );
    expect(quotaMessage({ reason: "daily", perDay: 50, retryAfterSeconds: 120 })).toContain("about 1 hour (");
  });

  it("explains the short rate limit in seconds", () => {
    expect(quotaMessage({ reason: "rate", perDay: 50, retryAfterSeconds: 42 })).toBe("Too many AI runs in a row. Try again in 42 seconds.");
    expect(quotaMessage({ reason: "rate", perDay: 50, retryAfterSeconds: 0 })).toBe("Too many AI runs in a row. Try again in 1 second.");
  });
});
