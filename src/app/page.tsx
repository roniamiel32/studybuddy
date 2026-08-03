/**
 * File:        src/app/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Public landing page. Explains the product and routes visitors
 *              into signup. Serves as the Phase 0.5 exit criterion — proof the
 *              application boots and renders. The visual design pass is Phase
 *              4b; this is intentionally plain.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import Link from 'next/link';
import { CalendarClock, MessageSquareText, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** The three signals the matching engine actually weighs. */
const FEATURES = [
  {
    icon: CalendarClock,
    title: 'Same course, same free hours',
    body: 'Every match is someone enrolled in the course you are looking at, whose weekly availability genuinely overlaps yours.',
  },
  {
    icon: Sparkles,
    title: 'Matched on how you study',
    body: 'Silent library or lively cafe, drilling problems or talking things through — matches are ranked on study style, not just a shared timetable.',
  },
  {
    icon: MessageSquareText,
    title: 'A first message already written',
    body: 'When a request is accepted, StudyBuddy hands you into WhatsApp with a personalised opener ready to send.',
  },
] as const;

const STEPS = [
  'Sign up with your university email.',
  'Answer six questions about how you study, and mark when you are free.',
  'Pick the courses you are taking this semester.',
  'Open a course and send a request to the partner who fits best.',
] as const;

/**
 * Renders the public landing page.
 *
 * @returns The landing page markup.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-20 px-6 py-16 sm:py-24">
      <section className="flex flex-col items-start gap-6">
        <Badge variant="secondary">Reichman University · Semester B</Badge>

        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Stop scrolling WhatsApp groups for a study partner.
        </h1>

        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">
          StudyBuddy matches you with students in your own courses who are free
          when you are and study the way you do — then hands you a first message
          worth sending.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: 'lg' })}>
            Get started
          </Link>
          <Link
            href="/login"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            I already have an account
          </Link>
        </div>
      </section>

      <section aria-labelledby="features-heading" className="flex flex-col gap-8">
        <h2 id="features-heading" className="text-2xl font-semibold tracking-tight">
          What makes a match
        </h2>

        <ul className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title}>
              <Card className="h-full">
                <CardHeader>
                  <Icon className="text-muted-foreground size-5" aria-hidden="true" />
                  <CardTitle className="mt-2 text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {body}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-8">
        <h2 id="how-heading" className="text-2xl font-semibold tracking-tight">
          How it works
        </h2>

        <ol className="flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-baseline gap-4">
              <span
                className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="text-pretty">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <footer className="text-muted-foreground border-border mt-auto border-t pt-8 text-sm">
        A Full-Stack course final project by Roni Amiel &amp; Eden Bitran.
      </footer>
    </main>
  );
}
