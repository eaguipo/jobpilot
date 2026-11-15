import type { Job } from "@/lib/data";
import { factCheck, type Flag } from "@/lib/fact-check";
import { CopyButton } from "./copy-button";

const KIND_LABEL: Record<Flag["kind"], string> = { skill: "Skill", number: "Number", name: "Name" };

function Flags({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) {
    return (
      <p data-testid="fact-check" className="mt-2 text-xs text-green-700 dark:text-green-400">
        ✓ No skills, numbers or names found that aren&apos;t on your resume.
      </p>
    );
  }
  return (
    <div
      data-testid="fact-check"
      role="note"
      className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200"
    >
      <p className="font-medium">
        Check before using: {flags.length} {flags.length === 1 ? "item isn't" : "items aren't"} on your resume.
      </p>
      <ul aria-label="Not on your resume" className="mt-1 flex flex-wrap gap-1">
        {flags.map((f) => (
          <li key={`${f.kind}:${f.term}`} className="rounded bg-amber-500/20 px-1.5 py-0.5">
            {KIND_LABEL[f.kind]}: {f.term}
          </li>
        ))}
      </ul>
      <p className="mt-1 opacity-80">Remove anything you can&apos;t back up, or add it to your master resume if it&apos;s true.</p>
    </div>
  );
}

function Doc({ id, title, text, flags }: { id: string; title: string; text: string; flags: Flag[] }) {
  return (
    <section aria-labelledby={id} data-testid={id} className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h4 id={id} className="text-xs font-semibold tracking-wide text-black/60 uppercase dark:text-white/60">
          {title}
        </h4>
        <CopyButton text={text} label={`Copy ${title.toLowerCase()}`} />
      </div>
      <Flags flags={flags} />
      <pre className="mt-2 max-h-96 overflow-auto rounded-md border border-black/10 bg-white p-3 font-sans text-sm leading-6 whitespace-pre-wrap break-words dark:border-white/15 dark:bg-black/30">
        {text}
      </pre>
    </section>
  );
}

/** Tailored resume and cover letter, each with a copy button and the "not on your resume" check. */
export function TailoredDocs({ job, resume }: { job: Job & { tailoredResume: string; coverLetter: string }; resume: string }) {
  const posting = `Company: ${job.company}\nTitle: ${job.title}\n\n${job.description}`;
  const check = (document: string) => factCheck({ document, resume, posting, gaps: job.gaps });
  return (
    <details open className="mt-3 rounded-lg bg-black/[0.03] p-3 dark:bg-white/[0.05]">
      <summary className="cursor-pointer text-sm font-medium">Tailored resume &amp; cover letter</summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <Doc id={`resume-${job.id}`} title="Tailored resume" text={job.tailoredResume} flags={check(job.tailoredResume)} />
        <Doc id={`letter-${job.id}`} title="Cover letter" text={job.coverLetter} flags={check(job.coverLetter)} />
      </div>
    </details>
  );
}
