/**
 * File:        src/app/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Public landing page, built to the Kinetic Learning design in
 *              docs/design/stitch/landing/. The hero shows the product's actual
 *              output — a stack of ranked matches — rather than describing it,
 *              because "we rank study partners for you" is the whole claim and
 *              showing it is more convincing than asserting it.
 * Version:     0.4.1
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 *     0.4.0 - 2026-08-03 - Rebuilt to the Stitch design
 *     0.4.1 - 2026-08-10 - Replaced old wordmark with the branded Logo component
 */

import Link from 'next/link';
import { ArrowRight, CalendarSync, HeartHandshake, Sparkles, Target, Users } from 'lucide-react';

import { PhoneShowcase } from '@/components/marketing/phone-showcase';
import { Logo } from '@/components/ui/logo';
import { buttonVariants } from '@/components/ui/button';

/** The four claims, each tied to something the system actually does. */
const FEATURES = [
  {
    icon: Users,
    tint: 'bg-[#f2f0ff] text-brand',
    title: 'Smart matching',
    body: 'We rank partners by the courses you share, the hours you both have free, and how you each like to study.',
  },
  {
    icon: CalendarSync,
    tint: 'bg-sunset-fixed text-sunset-deep',
    title: 'Your schedule, your way',
    body: 'Fill in a weekly grid by hand, or connect your calendar and let StudyBuddy work out when you are free.',
  },
  {
    icon: Target,
    tint: 'bg-[#ebf6ec] text-[#1f6b3a]',
    title: 'One course at a time',
    body: 'Every course has its own page, so a partner for Algorithms never gets lost among everything else.',
  },
  {
    icon: HeartHandshake,
    tint: 'bg-[#f6ebf0] text-grape',
    title: 'The first message, written',
    body: 'Accept a request and StudyBuddy opens WhatsApp with an opener that already mentions your shared course.',
  },
] as const;

/**
 * Renders the public landing page.
 *
 * @returns The landing page markup.
 */
export default function LandingPage() {
  return (
    <div className="bg-dotted flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm', pill: true })}>
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pt-8 pb-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pt-16 lg:pb-28">
          <div>
            <h1 className="font-heading text-[2.75rem] leading-[1.05] tracking-[-0.02em] text-balance sm:text-[3.5rem]">
              <span className="text-foreground">Find your </span>
              <span className="text-brand">perfect study </span>
              <span className="text-sunset">partner.</span>
            </h1>

            <p className="text-on-surface-variant mt-6 max-w-lg text-body-lg text-pretty">
              Match with students who share your courses, your free hours and your
              way of studying. Then start the conversation without the awkward
              first message.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/signup" className={buttonVariants({ variant: 'sunset', size: 'lg' })}>
                <Sparkles />
                Get started
                <ArrowRight />
              </Link>
            </div>

            <p className="text-on-surface-variant mt-5 text-body-md">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-brand rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:ring-brand/35 focus-visible:outline-none"
              >
                Sign in
              </Link>
            </p>
          </div>

          <PhoneShowcase />
        </section>

        {/* ------------------------------------------------------------ Features */}
        <section
          aria-labelledby="features-heading"
          className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 lg:pb-28"
        >
          <h2 id="features-heading" className="sr-only">
            How StudyBuddy works
          </h2>

          <ul className="border-outline-variant/30 shadow-clay grid gap-x-8 gap-y-10 rounded-xl border bg-white p-8 sm:grid-cols-2 sm:p-10 lg:grid-cols-4 lg:divide-x lg:divide-outline-variant/30 lg:gap-x-0">
            {FEATURES.map(({ icon: Icon, tint, title, body }) => (
              <li key={title} className="lg:px-6 lg:first:pl-0 lg:last:pr-0">
                <span
                  className={`mb-4 flex size-12 items-center justify-center rounded-lg ${tint}`}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                <h3 className="font-heading text-body-lg font-semibold">{title}</h3>
                <p className="text-on-surface-variant mt-2 text-body-md text-pretty">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------------------- Closing */}
        <section className="relative flex flex-1 flex-col">
          <svg
            className="text-brand block h-12 w-full sm:h-20"
            viewBox="0 0 1440 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              fill="currentColor"
              d="M0 60C240 0 480 0 720 30s480 60 720 10v60H0z"
            />
          </svg>

          <div className="bg-brand text-white">
            <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8 lg:pb-24">
              <p className="font-heading text-[2rem] leading-tight tracking-tight text-balance sm:text-headline-xl">
                You don&apos;t have to study alone.
              </p>
              <p className="font-heading mt-3 text-headline-md">
                <span className="text-sunset-fixed-dim">Learn</span>,{' '}
                <span className="text-[#a7f3c4]">grow</span> and{' '}
                <span className="text-grape-fixed">succeed</span> together.
              </p>

              <div className="text-on-surface-variant mt-10 flex flex-col gap-2 rounded-xl bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                <p className="text-body-md">
                  Built for{' '}
                  <span className="text-foreground font-semibold">Reichman University</span>.
                </p>
                <p className="text-outline text-label-md">
                  Designed to open to more campuses without a rebuild.
                </p>
              </div>

              <footer className="mt-14 border-t border-white/20 pt-6 text-label-md text-white/70">
                A Full-Stack course final project by Roni Amiel &amp; Eden Bitran.
              </footer>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}