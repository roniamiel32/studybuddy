/**
 * File:        src/components/marketing/phone-showcase.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The hero's centrepiece — a phone showing the product's actual
 *              output, a stack of ranked matches.
 * Version:     0.4.2
 */

import Image from 'next/image';
import { Sparkles } from 'lucide-react';

import { Chip } from '@/components/ui/chip';

/**
 * Illustrative matches. Deliberately not real students, and named as examples
 * rather than testimonials.
 */
const SAMPLE_MATCHES = [
  {
    initial: 'A',
    name: 'Alex',
    program: 'Computer Science',
    free: 'Free Mon, Wed',
    trait: { label: 'Night Owl', icon: '🌙', tone: 'grape' as const },
    tint: 'from-brand-fixed to-[#f2f0ff]',
  },
  {
    initial: 'M',
    name: 'Maya',
    program: 'Psychology',
    free: 'Free Tue, Thu',
    trait: { label: 'Early Bird', icon: '☀️', tone: 'sunset' as const },
    tint: 'from-sunset-fixed to-[#fff4ee]',
  },
  {
    initial: 'L',
    name: 'Leo',
    program: 'Data Science',
    free: 'Free weekends',
    trait: { label: 'Balanced', icon: '⚖️', tone: 'mint' as const },
    tint: 'from-[#ebf6ec] to-[#f4fbf5]',
  },
] as const;

/**
 * Renders the hero phone mockup.
 *
 * @returns The phone showcase element.
 */
export function PhoneShowcase() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[20rem] select-none">
      {/* Ambient wash behind the device, so it sits in light rather than on a flat field. */}
      <div className="from-brand-fixed/70 absolute -inset-10 -z-10 rounded-full bg-gradient-to-br to-transparent blur-3xl" />

      <div className="border-outline-variant/40 shadow-clay-lifted rounded-[2.5rem] border-8 border-white bg-white p-3">
        <div className="from-surface rounded-[1.75rem] bg-gradient-to-b to-[#f2f0ff] p-4">
          <p className="text-label-sm text-outline mb-2 text-center">Welcome to</p>
          <div className="mb-4 flex justify-center">
            <img
              src="/logo.png"
              alt="StudyBuddy Icon"
              className="w-9 h-9 object-contain shrink-0"
            />
          </div>

          <ul className="space-y-2.5">
            {SAMPLE_MATCHES.map((match) => (
              <li
                key={match.name}
                className="border-outline-variant/30 flex items-center gap-3 rounded-lg border bg-white/90 p-2.5 shadow-sm"
              >
                <span
                  className={`font-heading text-brand flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${match.tint} text-base`}
                >
                  {match.initial}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-label-md text-foreground block truncate">
                    {match.name}
                  </span>
                  <span className="text-outline block truncate text-[0.6875rem] leading-4">
                    {match.program}
                  </span>
                  <span className="text-outline block truncate text-[0.6875rem] leading-4">
                    {match.free}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {SAMPLE_MATCHES.map((match) => (
              <Chip key={match.trait.label} tone={match.trait.tone} icon={match.trait.icon}>
                {match.trait.label}
              </Chip>
            ))}
          </div>

          <div className="shadow-clay-btn mt-4 flex h-11 items-center justify-center gap-2 rounded-md bg-[linear-gradient(135deg,var(--color-brand-bright)_0%,var(--color-brand)_100%)] text-label-md text-white">
            <Sparkles className="size-4" />
            Find my match
          </div>
        </div>
      </div>

      <span className="bg-sunset/90 shadow-clay-sunset absolute -top-4 -right-3 flex size-12 rotate-12 items-center justify-center rounded-xl text-xl">
        💬
      </span>
      <span className="bg-grape-fixed shadow-clay absolute -bottom-5 -left-4 flex size-14 -rotate-6 items-center justify-center rounded-xl text-2xl">
        🎓
      </span>
    </div>
  );
}