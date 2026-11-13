import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addJob,
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
    const b = addJob(db, { ...sample, company: "Globex" });
    updateJob(db, a.id, { status: "Applied" });
    expect(listJobs(db).map((j) => j.id)).toEqual([b.id, a.id]);
    expect(listJobs(db, { status: "Applied" }).map((j) => j.id)).toEqual([a.id]);
    expect(deleteJob(db, a.id)).toBe(true);
    expect(getJob(db, a.id)).toBeNull();
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
});
