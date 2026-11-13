"use client";

import { useState } from "react";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2_000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      <span aria-live="polite">{state === "copied" ? "Copied ✓" : state === "failed" ? "Copy failed, select the text instead" : "Copy"}</span>
    </button>
  );
}
