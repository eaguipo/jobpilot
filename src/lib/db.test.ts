import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addJob,
  countJobsByStatus,
  isJobStatus,
  listStatusEvents,
  listStatusEventsByJob,
  deleteJob,
  getJob,
  getProfile,
  listJobs,
  openDb,
  saveProfile,
  updateJob,
  type Db,
} from "./db";

const sample = {
  company: "Acme",
  title: "Frontend Engineer",
  applyUrl: "https://boards.greenhouse.io/acme/jobs/1",
  description: "React, TypeScript, 3+ years.",
};

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

describe("profile", () => {
  it("is empty until saved, then keeps only the latest resume", () => {
    expect(getProfile(db)).toBeNull();
    saveProfile(db, "first");
    saveProfile(db, "second");
    expect(getProfile(db)?.resumeText).toBe("second");
  });
});

describe("jobs", () => {
  it("saves a job and reads it back (task 82 done-when)", () => {
    const created = addJob(db, sample);
    expect(getJob(db, created.id)).toEqual({
      ...sample,
      id: created.id,
      status: "Matched",
      score: null,
      met: [],
      gaps: [],
      tailoredResume: null,
      coverLetter: null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    });
  });

  it("updates score, met/gaps lists and status", () => {
    const { id } = addJob(db, sample);
    const job = updateJob(db, id, {
      score: 82,
      met: ["React", "TypeScript"],
      gaps: ["GraphQL"],
      status: "Applied",
    });
    expect(job).toMatchObject({ score: 82, met: ["React", "TypeScript"], gaps: ["GraphQL"], status: "Applied" });
  });

  it("ignores unknown fields instead of putting them in SQL", () => {
    const { id } = addJob(db, sample);
    const evil = { "title = 'x'; --": "boom", company: "Acme 2" } as never;
    expect(updateJob(db, id, evil)?.company).toBe("Acme 2");
    expect(getJob(db, id)?.title).toBe(sample.title);
  });

  it("rejects invalid status and out-of-range score", () => {
    const { id } = addJob(db, sample);
    expect(() => updateJob(db, id, { status: "Ghosted" as never })).toThrow();
    expect(() => updateJob(db, id, { score: 140 })).toThrow();
  });

  it("lists newest first, filters by status, and deletes", () => {
    const a = addJob(db, sample);
    const b = addJob(db, { ...sample, company: "Globex", applyUrl: "https://jobs.lever.co/globex/2" });
    updateJob(db, a.id, { status: "Applied" });
    expect(listJobs(db).map((j) => j.id)).toEqual([b.id, a.id]);
    expect(listJobs(db, { status: "Applied" }).map((j) => j.id)).toEqual([a.id]);
    expect(deleteJob(db, a.id)).toBe(true);
    expect(getJob(db, a.id)).toBeNull();
  });
});

describe("status history (migration v3)", () => {
  it("records an event when a job is added", () => {
    const job = addJob(db, sample);
    expect(listStatusEvents(db, job.id)).toEqual([
      { id: expect.any(Number), jobId: job.id, fromStatus: null, toStatus: "Matched", changedAt: job.createdAt },
    ]);
  });

  it("records real status changes only, newest first", () => {
    const { id } = addJob(db, sample);
    updateJob(db, id, { status: "Applied" });
    updateJob(db, id, { status: "Applied" }); // no change
    updateJob(db, id, { score: 70 }); // not a status change
    updateJob(db, id, { status: "Interviewing" });
    expect(listStatusEvents(db, id).map((e) => [e.fromStatus, e.toStatus])).toEqual([
      ["Applied", "Interviewing"],
      ["Matched", "Applied"],
      [null, "Matched"],
    ]);
  });

  it("does not record anything when the status is invalid", () => {
    const { id } = addJob(db, sample);
    expect(() => updateJob(db, id, { status: "Ghosted" as never })).toThrow();
    expect(listStatusEvents(db, id)).toHaveLength(1);
    expect(getJob(db, id)?.status).toBe("Matched");
  });

  it("groups history by job and deletes it with the job", () => {
    const a = addJob(db, sample);
    const b = addJob(db, { ...sample, applyUrl: "https://jobs.lever.co/x/2" });
    updateJob(db, b.id, { status: "Rejected" });
    const byJob = listStatusEventsByJob(db);
    expect(byJob.get(a.id)).toHaveLength(1);
    expect(byJob.get(b.id)?.map((e) => e.toStatus)).toEqual(["Rejected", "Matched"]);
    deleteJob(db, b.id);
    expect(listStatusEvents(db, b.id)).toEqual([]);
  });

  it("counts jobs per status, including zeros", () => {
    const a = addJob(db, sample);
    addJob(db, { ...sample, applyUrl: "https://jobs.lever.co/x/2" });
    updateJob(db, a.id, { status: "Offer" });
    expect(countJobsByStatus(db)).toEqual({ Matched: 1, Applied: 0, Interviewing: 0, Offer: 1, Rejected: 0 });
  });

  it("recognises valid statuses", () => {
    expect(isJobStatus("Applied")).toBe(true);
    expect(isJobStatus("applied")).toBe(false);
    expect(isJobStatus(undefined)).toBe(false);
  });
});

describe("unique apply link (migration v2)", () => {
  it("refuses a second job with the same link", () => {
    addJob(db, sample);
    expect(() => addJob(db, { ...sample, company: "Other" })).toThrow(/UNIQUE/);
  });
});

describe("file database", () => {
  it("persists across connections and creates the data folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobpilot-"));
    const file = path.join(dir, "nested", "test.db");
    try {
      const first = openDb(file);
      const { id } = addJob(first, sample);
      first.close();
      const second = openDb(file); // migrations must not re-run
      expect(getJob(second, id)?.company).toBe("Acme");
      second.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("upgrades a v1 database to the latest version without losing data", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jobpilot-"));
    const file = path.join(dir, "v1.db");
    try {
      // Simulate a database created before task 84: data saved, then no unique index,
      // no status history, user_version 1.
      const old = openDb(file);
      saveProfile(old, "my resume");
      const { id } = addJob(old, sample);
      old.exec("DROP INDEX jobs_apply_url_uq; DROP TABLE status_events;");
      old.pragma("user_version = 1");
      old.close();

      const upgraded = openDb(file);
      expect(upgraded.pragma("user_version", { simple: true })).toBe(3);
      // v3 back-fills one "added" event per existing job, at the job's creation time.
      expect(listStatusEvents(upgraded, id)).toEqual([
        { id: expect.any(Number), jobId: id, fromStatus: null, toStatus: "Matched", changedAt: getJob(upgraded, id)!.createdAt },
      ]);
      expect(getProfile(upgraded)?.resumeText).toBe("my resume");
      expect(getJob(upgraded, id)?.company).toBe("Acme");
      expect(() => addJob(upgraded, sample)).toThrow(/UNIQUE/);
      upgraded.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
