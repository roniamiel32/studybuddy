/**
 * File:        src/components/ui/button.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Button primitive. Scaffolded by shadcn/ui and then rewritten to
 *              the Kinetic Learning claymorphic spec — gradient fills, a white
 *              inner glow along the top edge, and a press that physically
 *              depresses the button.
 * Version:     0.4.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Added by `shadcn add` (Phase 0.5)
 *     0.4.0 - 2026-08-03 - Restyled to the Stitch design system
 */

import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Both gradients derive their second stop from a colour already in the palette
 * via color-mix, rather than introducing a new hex. That keeps the palette
 * closed: there is no fifth purple that exists only inside a button.
 */
const buttonVariants = cva(
  [
    'group/button inline-flex shrink-0 items-center justify-center gap-2',
    'rounded-md font-semibold whitespace-nowrap select-none',
    'transition-[transform,box-shadow,background-color,color,filter] duration-200 ease-out',
    'outline-none focus-visible:ring-4 focus-visible:ring-brand/35',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        /* The workhorse: purple, lifted, and it sinks 2px when pressed. */
        default: [
          'text-white shadow-clay-btn',
          'bg-[linear-gradient(135deg,var(--color-brand-bright)_0%,var(--color-brand)_100%)]',
          'hover:brightness-110',
          'active:translate-y-0.5 active:shadow-clay-btn-pressed',
        ],
        /*
         * Reserved for the single highest-intent action on a screen —
         * "Get started", "Connect". Its scarcity is what gives it force, so
         * resist reaching for it twice on one page.
         */
        sunset: [
          'text-white shadow-clay-sunset',
          'bg-[linear-gradient(135deg,var(--color-sunset)_0%,color-mix(in_oklab,var(--color-sunset)_78%,var(--color-sunset-deep))_100%)]',
          'hover:brightness-105',
          'active:translate-y-0.5',
        ],
        /* Ghost with a hairline brand border — the quiet half of a pair. */
        outline: [
          'border-[1.5px] border-brand bg-white text-brand shadow-clay-soft',
          'hover:bg-grape-fixed',
          'active:translate-y-0.5',
        ],
        /* Neutral action inside a card, where colour would be noise. */
        secondary: [
          'bg-surface-container text-on-surface-variant',
          'hover:bg-surface-container-high',
          'active:translate-y-0.5',
        ],
        ghost: 'text-on-surface-variant hover:bg-surface-container',
        destructive: 'bg-destructive text-white hover:brightness-110',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        /* Comfortably past the 44px touch target — this is a phone-first app. */
        default: 'h-11 px-5 text-label-md',
        sm: 'h-9 px-3.5 text-label-sm',
        lg: 'h-13 px-7 text-body-md',
        icon: 'size-11',
        'icon-sm': 'size-9',
      },
      /* Pill shape for chips and full-bleed card actions. */
      pill: {
        true: 'rounded-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
      pill: false,
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  pill = false,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, pill, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
