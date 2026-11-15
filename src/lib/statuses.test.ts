import { describe, expect, it } from "vitest";
import { isJobStatus, JOB_STATUSES } from "./statuses";

describe("job statuses", () => {
  it("lists the five tracker statuses in pipeline order", () => {
    expect(JOB_STATUSES).toEqual(["Matched", "Applied", "Interviewing", "Offer", "Rejected"]);
  });

  it("recognises valid statuses only, case-sensitively", () => {
    expect(isJobStatus("Applied")).toBe(true);
    expect(isJobStatus("applied")).toBe(false);
    expect(isJobStatus("Ghosted")).toBe(false);
    expect(isJobStatus(undefined)).toBe(false);
  });
});
