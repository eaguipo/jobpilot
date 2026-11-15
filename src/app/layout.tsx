import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/supabase/server";
import { signOutAction } from "./auth/actions";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobPilot",
  description: "Tailored resumes and cover letters, simple applications sent for you, and a tracker for the rest.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="border-b border-black/10 dark:border-white/15">
          <nav className="mx-auto flex w-full max-w-3xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              JobPilot
            </Link>
            <Link href="/jobs" className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white">
              Jobs
            </Link>
            <Link href="/profile" className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white">
              Profile
            </Link>
            <div className="ml-auto flex items-center gap-3">
              {user ? (
                <>
                  <span data-testid="signed-in-as" className="hidden max-w-48 truncate text-black/60 sm:inline dark:text-white/60">
                    {user.email}
                  </span>
                  <form action={signOutAction}>
                    <button type="submit" className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
                  Sign in
                </Link>
              )}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
