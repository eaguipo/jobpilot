import { describe, expect, it } from "vitest";
import { activitySummary, hasDocument, parseId } from "./activity";

describe("activitySummary", () => {
  it("summarises a score with met and gap counts", () => {
    expect(activitySummary({ kind: "match_scored", detail: { score: 82, met: ["a", "b"], gaps: ["c"] } })).toBe(
      "82/100 · 2 met, 1 gap",
    );
    expect(activitySummary({ kind: "match_scored", detail: { score: 0, met: [], gaps: ["x", "y"] } })).toBe(
      "0/100 · 0 met, 2 gaps",
    );
  });

  it("tolerates missing or malformed detail", () => {
    expect(activitySummary({ kind: "match_scored", detail: {} })).toBeNull();
    expect(activitySummary({ kind: "match_scored", detail: { score: "82" } })).toBeNull();
    expect(activitySummary({ kind: "match_scored", detail: { score: 50, met: "React" } })).toBe("50/100 · 0 met, 0 gaps");
  });

  it("has no summary for documents", () => {
    expect(activitySummary({ kind: "resume_tailored", detail: {} })).toBeNull();
  });
});

describe("hasDocument", () => {
  it("is true only for generated documents", () => {
    expect(hasDocument("resume_tailored")).toBe(true);
    expect(hasDocument("cover_letter_written")).toBe(true);
    expect(hasDocument("match_scored")).toBe(false);
    expect(hasDocument("application_submitted")).toBe(false);
  });
});

describe("parseId", () => {
  it("accepts positive integers only", () => {
    expect(parseId("42")).toBe(42);
    for (const bad of [undefined, "", "0", "-1", "1.5", "01", "1e3", "abc", "42abc", ["1"], "99999999999999999"]) {
      expect(parseId(bad as string | undefined)).toBeUndefined();
    }
  });
});
