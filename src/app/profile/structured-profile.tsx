import type { StructuredResume } from "@/lib/resume-parse";
import { ParseButton } from "./parse-button";

const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const dates = (start: string, end: string) => [start, end].filter(Boolean).join(" – ");

function Section({ id, title, empty, children }: { id: string; title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="text-sm font-semibold uppercase tracking-wide text-black/70 dark:text-white/70">
        {title}
      </h3>
      {empty ? <p className="text-sm text-black/50 dark:text-white/50">Not found on your resume.</p> : children}
    </section>
  );
}

/**
 * Story 12: the saved resume split into sections. Read-only: the resume text stays the
 * source of truth, so to change a section the user edits the resume and rebuilds.
 */
export function StructuredProfile({
  structured,
  structuredAt,
  hasResume,
  stale,
}: {
  structured: StructuredResume | null;
  structuredAt: string | null;
  hasResume: boolean;
  stale: boolean;
}) {
  const s = structured;
  return (
    <section aria-labelledby="structured-heading" className="flex flex-col gap-4 border-t border-black/10 pt-6 dark:border-white/15">
      <div>
        <h2 id="structured-heading" className="text-lg font-semibold">
          Structured profile
        </h2>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Your saved resume split into sections. It only copies what your resume says. To change it, edit the resume above, save, and rebuild.
          {s && structuredAt ? ` Built ${formatTime(structuredAt)}.` : ""}
        </p>
      </div>
      <ParseButton hasResume={hasResume} hasStructure={!!s} stale={stale} />

      {s && (
        <div className={`flex flex-col gap-5 ${stale ? "opacity-60" : ""}`}>
          <Section id="sp-contact" title="Contact" empty={!s.contact.name && !s.contact.email && !s.contact.phone && !s.contact.location && s.contact.links.length === 0}>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              {(
                [
                  ["Name", s.contact.name],
                  ["Email", s.contact.email],
                  ["Phone", s.contact.phone],
                  ["Location", s.contact.location],
                  ["Links", s.contact.links.join(", ")],
                ] as const
              )
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-black/60 dark:text-white/60">{k}</dt>
                    <dd className="break-words">{v}</dd>
                  </div>
                ))}
            </dl>
          </Section>

          <Section id="sp-summary" title="Summary" empty={!s.summary}>
            <p className="text-sm leading-6">{s.summary}</p>
          </Section>

          <Section id="sp-experience" title="Experience" empty={s.experience.length === 0}>
            <ol className="flex flex-col gap-4">
              {s.experience.map((e, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium">
                    {e.title} · {e.company}
                  </p>
                  {(e.start || e.end || e.location) && (
                    <p className="text-black/60 dark:text-white/60">{[dates(e.start, e.end), e.location].filter(Boolean).join(" · ")}</p>
                  )}
                  {e.bullets.length > 0 && (
                    <ul className="mt-1 list-disc pl-5 leading-6">
                      {e.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </Section>

          <Section id="sp-education" title="Education" empty={s.education.length === 0}>
            <ul className="flex flex-col gap-2 text-sm">
              {s.education.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{e.school}</span>
                  {e.degree ? ` · ${e.degree}` : ""}
                  {e.start || e.end ? <span className="text-black/60 dark:text-white/60"> · {dates(e.start, e.end)}</span> : null}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="sp-skills" title="Skills" empty={s.skills.length === 0}>
            <ul className="flex flex-wrap gap-2">
              {s.skills.map((k) => (
                <li key={k} className="rounded-full bg-black/5 px-3 py-1 text-xs dark:bg-white/10">
                  {k}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </section>
  );
}
