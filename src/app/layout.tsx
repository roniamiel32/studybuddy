/**
 * File:        src/app/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Root layout. Deliberately minimal — it sets fonts, metadata and
 *              the html/body shell only. The authenticated navigation shell
 *              lives in the (app) route group so that public pages do not
 *              render it.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

/*
 * The variable name must stay in sync with the `@theme` block in globals.css,
 * which maps Tailwind's `font-sans` to `--font-sans`. A mismatch here is silent:
 * the page simply falls back to the browser's default serif.
 */
const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'StudyBuddy — find the right study partner',
    template: '%s · StudyBuddy',
  },
  description:
    'StudyBuddy matches you with students in your own courses who are free when you are and study the way you do.',
};

/**
 * Wraps every page in the application shell.
 *
 * @param children - The route being rendered.
 * @returns The html document shell.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
