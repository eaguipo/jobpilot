import type { Metadata } from "next";
import Link from "next/link";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
            <Link href="/profile" className="text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white">
              Profile
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
