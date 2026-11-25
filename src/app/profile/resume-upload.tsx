"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  RESUME_BUCKET,
  RESUME_FILE_MAX_BYTES,
  RESUME_FILE_MIME,
  resumePath,
  resumeTypeFromName,
  type StoredResumeFile,
} from "@/lib/resume-storage";
import { readUploadedResume } from "./actions";

export type StoredFileInfo = StoredResumeFile & { downloadUrl: string | null };

type Status = { kind: "idle" } | { kind: "busy"; step: string } | { kind: "error"; message: string } | { kind: "done"; name: string };

const formatSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/**
 * Story 11: upload a PDF or DOCX. The browser sends the file straight to Storage (the
 * Storage policies limit each user to their own two paths), then the server reads it
 * and the text lands in the resume box for the user to check and save.
 */
export function ResumeUpload({ userId, storedFile, onText }: { userId: string; storedFile: StoredFileInfo | null; onText: (text: string) => void }) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const input = useRef<HTMLInputElement>(null);

  async function handle(file: File) {
    const type = resumeTypeFromName(file.name);
    if (!type) return setStatus({ kind: "error", message: "Choose a PDF or DOCX file." });
    if (file.size === 0) return setStatus({ kind: "error", message: "That file is empty." });
    if (file.size > RESUME_FILE_MAX_BYTES) return setStatus({ kind: "error", message: "That file is over 5 MB." });

    setStatus({ kind: "busy", step: "Uploading…" });
    const { error } = await createSupabaseBrowser()
      .storage.from(RESUME_BUCKET)
      .upload(resumePath(userId, type), file, { contentType: RESUME_FILE_MIME[type], upsert: true });
    if (error) return setStatus({ kind: "error", message: "Upload failed. Check your connection and try again." });

    setStatus({ kind: "busy", step: "Reading your resume…" });
    try {
      const result = await readUploadedResume(type);
      if (result.status === "error") return setStatus({ kind: "error", message: result.error });
      onText(result.text);
      setStatus({ kind: "done", name: file.name });
    } catch {
      setStatus({ kind: "error", message: "Couldn't read the file. Try again, or paste your resume as text." });
    }
  }

  const busy = status.kind === "busy";
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-black/20 p-4 dark:border-white/25">
      <div className="flex flex-wrap items-center gap-3">
        <label
          htmlFor="resume-file"
          aria-disabled={busy || undefined}
          className="cursor-pointer rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-within:ring-2 focus-within:ring-blue-600/40 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950"
        >
          Upload PDF or DOCX
          <input
            ref={input}
            id="resume-file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = ""; // choosing the same file again still triggers a change
              if (file) void handle(file);
            }}
          />
        </label>
        <span className="text-xs text-black/60 dark:text-white/60">Up to 5 MB. The text appears below for you to check before saving.</span>
      </div>

      <p aria-live="polite" data-testid="upload-status" className="text-sm">
        {status.kind === "busy" ? (
          <span className="text-black/70 dark:text-white/70">{status.step}</span>
        ) : status.kind === "error" ? (
          <span className="text-red-600 dark:text-red-400">{status.message}</span>
        ) : status.kind === "done" ? (
          <span className="text-green-700 dark:text-green-400">Read {status.name}. Check the text below, then save.</span>
        ) : null}
      </p>

      {storedFile && status.kind !== "done" && (
        <p className="text-xs text-black/60 dark:text-white/60" data-testid="stored-resume-file">
          Uploaded file: resume.{storedFile.type} · {formatSize(storedFile.size)}
          {storedFile.uploadedAt ? ` · ${formatTime(storedFile.uploadedAt)}` : ""}
          {storedFile.downloadUrl && (
            <>
              {" · "}
              <a href={storedFile.downloadUrl} className="text-blue-700 underline dark:text-blue-300">
                Download
              </a>
            </>
          )}
        </p>
      )}
      <noscript>
        <p className="text-xs text-black/60">Uploading a file needs JavaScript. You can still paste your resume below.</p>
      </noscript>
    </div>
  );
}
