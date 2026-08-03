/**
 * File:        src/types/database.types.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Generated PostgreSQL schema types. This file is a placeholder
 *              until the Phase 1a migrations exist, at which point it is
 *              overwritten wholesale by `npm run gen:types` and should never
 *              be edited by hand.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Placeholder so the typed Supabase clients compile
 *                          before any migration exists (Phase 0.5 scaffold)
 */

/**
 * Shape expected by `@supabase/supabase-js` generics. Empty on purpose: the
 * real definition is generated from the live schema in Phase 1a.
 */
export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
