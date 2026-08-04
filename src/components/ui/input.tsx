/**
 * File:        src/components/ui/input.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Text input. Scaffolded by shadcn/ui, then restyled per the
 *              Kinetic Learning spec: fields rest on a faint purple wash and
 *              turn white on focus, so focusing a field reads as it lighting
 *              up rather than merely gaining a ring.
 * Version:     0.4.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Added by `shadcn add` (Phase 0.5)
 *     0.4.0 - 2026-08-03 - Restyled to the Stitch design system
 */

import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // 16px text on mobile: anything smaller makes iOS Safari zoom the
        // viewport on focus, which is disorienting mid-form.
        "h-11 w-full min-w-0 rounded-md border border-outline-variant/60 bg-field px-4 py-2 text-body-md transition-colors outline-none",
        "placeholder:text-outline",
        "focus-visible:border-brand focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-brand/25",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/20",
        "file:inline-flex file:h-8 file:border-0 file:bg-transparent file:text-label-md file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
