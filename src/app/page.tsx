import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">JobPilot</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Prototype. Start by adding your master resume. Adding jobs, match scores and tailoring come next.
      </p>
      <Link
        href="/profile"
        className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        Go to Profile
      </Link>
    </main>
  );
}
