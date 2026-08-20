/**
 * File:        scripts/diagnose-signup-domain.mjs
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Answers "why is this address rejected at registration" against
 *              whichever database the credentials point at.
 *
 *              IT ASKS THE SAME QUESTIONS resolveInstitution ASKS, in the same
 *              order and with the same client, so a green run here means signUp
 *              cannot be returning FORBIDDEN for that address on that database.
 *              The point is to tell the two environments apart: the row can be
 *              correct in the project you have open in the dashboard and absent
 *              from the one the deployment actually talks to.
 *
 *              Read-only. It never writes, so it is safe to point at production.
 * Version:     0.50.0
 *
 * Modifications:
 *     0.50.0 - 2026-08-19 - Initial implementation
 *
 * Usage — run from the repository root:
 *   Local:
 *     node scripts/diagnose-signup-domain.mjs roni.amiel@post.runi.ac.il
 *
 *   Production — paste the SAME values Vercel has, and mind the shell history:
 *     NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
 *     SUPABASE_SERVICE_ROLE_KEY=<service role key> \
 *     node scripts/diagnose-signup-domain.mjs roni.amiel@post.runi.ac.il
 */

import { createClient } from '@supabase/supabase-js';

const email = process.argv[2] ?? 'roni.amiel@post.runi.ac.il';

/* Only read from a local file when the environment did not supply the values,
   so a production run is never silently answered by local credentials. */
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    process.loadEnvFile('.env.local');
    console.log('· credentials: .env.local (local database)\n');
  } catch {
    console.error('No SUPABASE_SERVICE_ROLE_KEY in the environment and no .env.local to read.');
    process.exit(1);
  }
} else {
  console.log('· credentials: environment (whatever you pointed them at)\n');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

/* The project ref is the middle of the URL and is not a secret. Printing it is
   the whole point: it is what tells you which database answered. */
console.log(`· database:    ${url}`);
console.log(`· address:     ${email}`);

const domain = email.trim().toLowerCase().split('@')[1] ?? '';

console.log(`· domain read: ${JSON.stringify(domain)}\n`);

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

/* ---- 1. Can this client read the table at all? ------------------------- */
const reachable = await db.from('university_domains').select('domain').limit(1);

if (reachable.error) {
  console.log('FAIL  the domain table could not be read at all.');
  console.log(`      ${reachable.error.message}`);
  console.log('\n      A wrong service-role key, a key from a different project, or a');
  console.log('      missing grant all land here. Before the fix, this produced the');
  console.log('      "if it is a staff address" message.');
  process.exit(1);
}

/* ---- 2. The exact lookup resolveInstitution makes ----------------------- */
const exact = await db
  .from('university_domains')
  .select('domain, university_id, is_student_domain, universities(name)')
  .eq('domain', domain)
  .maybeSingle();

if (exact.error) {
  console.log(`FAIL  the lookup itself errored: ${exact.error.message}`);
  process.exit(1);
}

if (!exact.data) {
  console.log(`MISS  no row matches domain = ${JSON.stringify(domain)} on THIS database.`);

  /* The near-misses are the useful part: a padded or differently-spelled row
     looks identical in a dashboard table and never matches an equality filter. */
  const stem = domain.split('.').slice(-3).join('.');
  const near = await db.from('university_domains').select('domain, is_student_domain');

  const candidates = (near.data ?? []).filter((row) => row.domain.includes(stem.split('.')[0]));

  if (candidates.length > 0) {
    console.log('\n      Rows that look related:');
    for (const row of candidates) {
      const padded = row.domain !== row.domain.trim() ? '   <-- HAS WHITESPACE' : '';
      console.log(
        `        ${JSON.stringify(row.domain)}  is_student_domain=${row.is_student_domain}${padded}`,
      );
    }
    console.log('\n      A padded or misspelled value cannot be fixed in app code: the');
    console.log('      handle_new_user trigger matches this column exactly too.');
  } else {
    console.log('\n      Nothing similar at all — this is very likely a different project');
    console.log('      from the one open in your dashboard.');
  }

  console.log('\n      signUp would try to PROVISION the institution from here.');
  process.exit(1);
}

/* ---- 3. The only branch that is the student's problem ------------------- */
if (!exact.data.is_student_domain) {
  console.log('STAFF the row exists and is_student_domain = false.');
  console.log('      The "use your student address" message is correct for this address.');
  process.exit(1);
}

console.log('OK    the row exists and is_student_domain = true.');
console.log(`      university_id: ${exact.data.university_id}`);
console.log(`      university:    ${exact.data.universities?.name ?? '(no matching row!)'}`);

if (!exact.data.universities) {
  console.log('\nWARN  the university_id does not resolve to a universities row.');
  console.log('      Registration still succeeds, but the institution will be unnamed.');
}

/* ---- 4. Degrees, which onboarding step 1 needs to be non-empty ---------- */
const degrees = await db
  .from('degrees')
  .select('id', { count: 'exact', head: true })
  .eq('university_id', exact.data.university_id);

console.log(`      degrees:       ${degrees.count ?? 0}`);

if ((degrees.count ?? 0) === 0) {
  console.log('\nWARN  no degrees for this university — onboarding step 1 will be empty.');
}

console.log('\nresolveInstitution CANNOT return FORBIDDEN for this address on this database.');
console.log('If the deployed app still rejects it, it is not talking to this database.');
