import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">JobPilot</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Prototype. Add your master resume, then add the jobs you want. Match scores and tailoring come next.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/profile"
          className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Go to Profile
        </Link>
        <Link
          href="/jobs"
          className="inline-block rounded-lg border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Add a job
        </Link>
      </div>
    </main>
  );
}
