/**
 * File:        scripts/gen-types.mjs
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Regenerates src/types/database.types.ts from the local Supabase
 *              schema. Wraps the CLI rather than redirecting its output
 *              directly so the generated file keeps the project's file header —
 *              a bare `supabase gen types > file` strips it on every run.
 * Version:     0.3.0
 *
 * Modifications:
 *     0.3.0 - 2026-08-03 - Initial implementation (Phase 1a)
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUTPUT_PATH = 'src/types/database.types.ts';

/**
 * Builds the file header prepended to the generated types.
 *
 * @returns The header comment block, ending in a blank line.
 */
function header() {
  return [
    '/**',
    ` * File:        ${OUTPUT_PATH}`,
    ' * Authors:     Roni Amiel & Eden Bitran',
    ' * Description: PostgreSQL schema types, GENERATED from the live local',
    ' *              database. Do not edit by hand — run `npm run gen:types`',
    ' *              after every migration instead.',
    ' * Version:     generated',
    ' *',
    ' * Modifications:',
    ' *     Regenerated automatically; see supabase/migrations for schema history.',
    ' */',
    '',
    '',
  ].join('\n');
}

/**
 * Runs the Supabase type generator and writes the result with a header.
 *
 * @returns Nothing.
 * @throws Error if the Supabase CLI exits non-zero.
 */
function main() {
  const generated = execFileSync(
    'npx',
    ['supabase', 'gen', 'types', 'typescript', '--local'],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );

  writeFileSync(OUTPUT_PATH, header() + generated, 'utf8');
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
}

main();
