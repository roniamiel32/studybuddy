/**
 * File:        src/app/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Root layout. Deliberately minimal — it sets fonts, metadata and
 *              the html/body shell only. The authenticated navigation shell
 *              lives in the (app) route group so that public pages do not
 *              render it.
 * Version:     0.2.1
 *
 * Modifications:
 *     0.2.1 - 2026-08-10 - Added ThemeProvider for dark mode support
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import type { Metadata } from 'next';
import { Nunito, Plus_Jakarta_Sans } from 'next/font/google';

import './globals.css';

const headingFont = Nunito({
  variable: '--font-heading-family',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
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
      className={`${headingFont.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}