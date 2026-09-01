/**
 * File:        src/lib/google/calendar.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Everything this app says to Google: the consent URL, the two
 *              token exchanges, a free/busy query, and creating or deleting one
 *              event.
 *
 *              Plain `fetch` rather than `googleapis`, for the reason
 *              src/lib/ai/provider.ts gives for not taking a vendor SDK: the
 *              surface used here is five endpoints, and the official client is a
 *              large dependency plus its own auth abstraction to keep current.
 *
 *              RESULTS ARE RETURNED, NOT THROWN. A student's calendar can fail
 *              in half a dozen ordinary ways — consent revoked, token expired,
 *              Google having a bad minute — and none of them should surface as a
 *              stack trace in the middle of an RSVP. Callers get a discriminated
 *              result and decide.
 *
 *              COMMENTED OUT IN FULL — 2026-09-01. Nothing here runs; the note
 *              under the header says why and how to bring it back.
 * Version:     0.50.0
 *
 * Modifications:
 *     0.50.0 - 2026-09-01 - Disabled in full. No scope is requested, no code is
 *                           exchanged, no token is refreshed, and no calendar is
 *                           read anywhere in the app
 *     0.49.0 - 2026-09-01 - The `calendar.events` scope and the two event-write
 *                           calls are commented out. Sessions reach a student's
 *                           calendar through the manual link in the session
 *                           dialog instead, which needs no OAuth scope
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

/*
 * ============================================================================
 * DISABLED IN FULL — 2026-09-01. THIS APP NO LONGER TALKS TO GOOGLE.
 *
 * `calendar.events` went first, and `calendar.readonly` has now followed it.
 * Both are sensitive scopes, and the point of this pass is that there is no
 * longer any code path anywhere in the app that ASKS for one — no consent URL
 * is built, no authorization code is exchanged, no refresh token is renewed,
 * and no calendar is read. A student therefore cannot be shown Google's
 * unverified-app warning, because they are never sent to Google at all.
 *
 * What replaced it: the "Add to Google Calendar" link in the session dialog, a
 * plain `calendar/render?action=TEMPLATE` URL that the student's own browser
 * follows. It needs no OAuth, no verification and no credentials.
 *
 * Everything downstream of this file is commented out with it:
 *
 *   - src/features/calendar/write-sync.ts   (whole file)
 *   - src/features/calendar/read-sync.ts    (whole file)
 *   - src/features/calendar/actions.ts      (whole file)
 *   - src/app/api/auth/google-calendar/callback/route.ts
 *   - src/components/calendar/calendar-sync-card.tsx
 *   - saveConnection and loadUsableConnection in features/calendar/connection.ts
 *
 * The database-only half of connection.ts is untouched and still runs:
 * standDownCalendarSync is what hands a week back to the hand-drawn grid, and
 * it never spoke to Google. Tables and migrations are untouched too.
 * ============================================================================
 */

/* The file must stay a module: `isolatedModules` refuses one with no imports
   and no exports, and everything real below is commented out. */
export {};

// import 'server-only';
//
// import { isGoogleCalendarConfigured, serverEnv } from '@/lib/env';
//
// /**
//  * The minimum Google will accept for what this feature does.
//  *
//  * `calendar.readonly` is what the read sync needs: it asks when the student is
//  * busy so the week can fill itself in. `userinfo.email` exists only so the UI can
//  * name the connected account — a student with a personal and a university Google
//  * account otherwise has no way to tell which one they attached.
//  *
//  * The write scope that used to sit above them is commented out; see the note
//  * inside the array.
//  */
// export const GOOGLE_SCOPES = [
//   /*
//    * WRITE SCOPE DISABLED — 2026-09-01. `calendar.events` is a restricted scope,
//    * and asking for it is what puts this project in front of Google's OAuth
//    * verification. Nothing needs it any more: the write sync is commented out
//    * (src/features/calendar/write-sync.ts) and a session now reaches a student's
//    * calendar through the manual "Add to Google Calendar" link in the session
//    * dialog, which is a plain URL and asks Google for no permission at all.
//    *
//    * Restore this line together with write-sync.ts and its callers.
//    *
//    * 'https://www.googleapis.com/auth/calendar.events',
//    */
//   'https://www.googleapis.com/auth/calendar.readonly',
//   'https://www.googleapis.com/auth/userinfo.email',
// ] as const;
//
// const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
// const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
// const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
// const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
//
// /** Hard ceiling on one call, so a hanging Google cannot hang a request. */
// const TIMEOUT_MS = 15_000;
//
// export type GoogleResult<T> =
//   | { ok: true; data: T }
//   | {
//       ok: false;
//       reason: 'not_configured' | 'auth_revoked' | 'insufficient_scope' | 'request_failed';
//       /*
//        * Google's own words, trimmed. Carried all the way to the student's screen
//        * and the connection row, because "the sync failed" is a true sentence that
//        * has never once helped anybody work out what to do next.
//        */
//       detail?: string;
//     };
//
// export interface GoogleTokens {
//   accessToken: string;
//   /** Absent on every exchange after the first. Never overwrite a stored one with this. */
//   refreshToken: string | null;
//   expiresAt: Date | null;
//   scope: string | null;
// }
//
// /**
//  * The redirect URI, derived rather than configured twice.
//  *
//  * It has to match the Google Cloud entry byte for byte, so it is built from
//  * NEXT_PUBLIC_SITE_URL — the value the app already knows it is served from —
//  * instead of a second env var that can drift out of step with the first.
//  *
//  * @returns The absolute callback URL.
//  */
// export function googleRedirectUri(): string {
//   const site = serverEnv().NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '';
//   return `${site.replace(/\/$/, '')}/api/auth/google-calendar/callback`;
// }
//
// /**
//  * Builds the URL that asks the student for consent.
//  *
//  * @param state - An opaque value echoed back to the callback, used to prove the
//  *                redirect belongs to a request this app started.
//  * @returns The consent URL, or null when the integration is unconfigured.
//  */
// export function consentUrl(state: string): string | null {
//   if (!isGoogleCalendarConfigured()) {
//     return null;
//   }
//
//   const params = new URLSearchParams({
//     client_id: serverEnv().GOOGLE_CLIENT_ID!,
//     redirect_uri: googleRedirectUri(),
//     response_type: 'code',
//     scope: GOOGLE_SCOPES.join(' '),
//     /* Required to get a refresh token at all. Without it the connection dies
//        an hour later and the student has to reconnect, forever. */
//     access_type: 'offline',
//     /*
//      * Forces the consent screen even when the student has approved before.
//      * Google only returns a refresh token alongside a fresh consent, so a
//      * reconnect after a revoke would otherwise hand back an access token with
//      * nothing to renew it.
//      */
//     prompt: 'consent',
//     include_granted_scopes: 'true',
//     state,
//   });
//
//   return `${AUTH_ENDPOINT}?${params.toString()}`;
// }
//
// /**
//  * Reads a token response into our shape.
//  *
//  * @param payload - Google's JSON body.
//  * @returns The tokens.
//  */
// function readTokens(payload: {
//   access_token?: string;
//   refresh_token?: string;
//   expires_in?: number;
//   scope?: string;
// }): GoogleTokens | null {
//   if (!payload.access_token) {
//     return null;
//   }
//
//   return {
//     accessToken: payload.access_token,
//     refreshToken: payload.refresh_token ?? null,
//     expiresAt: payload.expires_in
//       ? new Date(Date.now() + payload.expires_in * 1000)
//       : null,
//     scope: payload.scope ?? null,
//   };
// }
//
// /**
//  * Posts to the token endpoint.
//  *
//  * @param body - Form fields for the grant being used.
//  * @returns The tokens, or why not.
//  */
// async function postToken(body: Record<string, string>): Promise<GoogleResult<GoogleTokens>> {
//   if (!isGoogleCalendarConfigured()) {
//     return { ok: false, reason: 'not_configured' };
//   }
//
//   const env = serverEnv();
//
//   try {
//     const response = await fetch(TOKEN_ENDPOINT, {
//       method: 'POST',
//       headers: { 'content-type': 'application/x-www-form-urlencoded' },
//       body: new URLSearchParams({
//         client_id: env.GOOGLE_CLIENT_ID!,
//         client_secret: env.GOOGLE_CLIENT_SECRET!,
//         ...body,
//       }),
//       signal: AbortSignal.timeout(TIMEOUT_MS),
//     });
//
//     if (!response.ok) {
//       /*
//        * `invalid_grant` is the one failure that is not transient: the student
//        * revoked access, or the refresh token was already replaced. Retrying will
//        * never help, so it is reported separately and the caller disconnects.
//        */
//       const body = (await response.text()).slice(0, 500);
//       const revoked = response.status === 400 && body.includes('invalid_grant');
//
//       console.error('[google.token] exchange failed', response.status, body.slice(0, 200));
//
//       return {
//         ok: false,
//         reason: revoked ? 'auth_revoked' : 'request_failed',
//         detail: body.slice(0, 200) || `status ${response.status}`,
//       };
//     }
//
//     const tokens = readTokens(await response.json());
//
//     return tokens
//       ? { ok: true, data: tokens }
//       : { ok: false, reason: 'request_failed', detail: 'no access token in response' };
//   } catch (error) {
//     console.error('[google.token] request threw:', error);
//     return { ok: false, reason: 'request_failed' };
//   }
// }
//
// /**
//  * Spends the one-time code from the consent redirect.
//  *
//  * @param code - The `code` query parameter.
//  * @returns The tokens, or why not.
//  */
// export async function exchangeCode(code: string): Promise<GoogleResult<GoogleTokens>> {
//   return postToken({
//     code,
//     grant_type: 'authorization_code',
//     redirect_uri: googleRedirectUri(),
//   });
// }
//
// /**
//  * Renews an expired access token.
//  *
//  * @param refreshToken - The stored refresh token.
//  * @returns Fresh tokens, or why not.
//  */
// export async function refreshAccessToken(
//   refreshToken: string,
// ): Promise<GoogleResult<GoogleTokens>> {
//   return postToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });
// }
//
// /**
//  * Reads an error body without letting it become the problem.
//  *
//  * Google returns JSON with a `message` worth showing; anything else is truncated
//  * so a stray HTML error page cannot end up in a database column or a toast.
//  *
//  * @param response - The failed response.
//  * @returns A short description.
//  */
// async function readError(response: Response): Promise<string> {
//   try {
//     const text = (await response.text()).slice(0, 500);
//
//     try {
//       const parsed = JSON.parse(text) as { error?: { message?: string; status?: string } };
//       const message = parsed.error?.message;
//       if (message) {
//         return message.slice(0, 200);
//       }
//     } catch {
//       /* Not JSON. The raw text below is still better than nothing. */
//     }
//
//     return text.slice(0, 200) || `status ${response.status}`;
//   } catch {
//     return `status ${response.status}`;
//   }
// }
//
// /**
//  * Calls a Calendar API endpoint with a bearer token.
//  *
//  * @param accessToken - A valid access token.
//  * @param url         - The absolute endpoint URL.
//  * @param init        - Fetch options.
//  * @returns The parsed body, or why not.
//  */
// async function callApi<T>(
//   accessToken: string,
//   url: string,
//   init: RequestInit = {},
// ): Promise<GoogleResult<T>> {
//   try {
//     const response = await fetch(url, {
//       ...init,
//       headers: {
//         authorization: `Bearer ${accessToken}`,
//         'content-type': 'application/json',
//         ...(init.headers ?? {}),
//       },
//       signal: AbortSignal.timeout(TIMEOUT_MS),
//     });
//
//     /* 410 Gone on a delete means somebody already removed it. That is the state
//        we were trying to reach, so it is a success. */
//     if (response.status === 204 || response.status === 410) {
//       return { ok: true, data: undefined as T };
//     }
//
//     if (!response.ok) {
//       const detail = await readError(response);
//
//       /*
//        * 401 means the token is dead — revoked, or the grant was withdrawn.
//        * Reconnecting fixes it.
//        */
//       if (response.status === 401) {
//         console.error('[google.api] token rejected:', detail);
//         return { ok: false, reason: 'auth_revoked', detail };
//       }
//
//       /*
//        * 403 is two very different things wearing one status code. A missing
//        * scope is a consent problem the student can fix by reconnecting; anything
//        * else — the API not enabled on the project, a quota — is the deployment's
//        * problem and telling a student to reconnect would waste their time.
//        */
//       if (response.status === 403) {
//         const scopeProblem = /insufficient|scope/i.test(detail);
//         console.error('[google.api] forbidden:', detail);
//
//         return {
//           ok: false,
//           reason: scopeProblem ? 'insufficient_scope' : 'request_failed',
//           detail,
//         };
//       }
//
//       console.error('[google.api] call failed', response.status, detail);
//       return { ok: false, reason: 'request_failed', detail };
//     }
//
//     return { ok: true, data: (await response.json()) as T };
//   } catch (error) {
//     console.error('[google.api] request threw:', error);
//     return { ok: false, reason: 'request_failed' };
//   }
// }
//
// /**
//  * Reads the connected account's address, for display only.
//  *
//  * @param accessToken - A valid access token.
//  * @returns The email, or why not.
//  */
// export async function fetchAccountEmail(
//   accessToken: string,
// ): Promise<GoogleResult<string | null>> {
//   const result = await callApi<{ email?: string }>(accessToken, USERINFO_ENDPOINT);
//
//   return result.ok ? { ok: true, data: result.data.email ?? null } : result;
// }
//
// /**
//  * Reads the primary calendar's timezone.
//  *
//  * This, not the server's clock, is what the availability maths is anchored to.
//  *
//  * @param accessToken - A valid access token.
//  * @returns An IANA timezone name, or why not.
//  */
// export async function fetchCalendarTimezone(
//   accessToken: string,
// ): Promise<GoogleResult<string>> {
//   const result = await callApi<{ timeZone?: string }>(
//     accessToken,
//     `${CALENDAR_API}/calendars/primary`,
//   );
//
//   if (!result.ok) {
//     return result;
//   }
//
//   return { ok: true, data: result.data.timeZone || 'UTC' };
// }
//
// /**
//  * Asks when the student is busy.
//  *
//  * The freeBusy endpoint rather than listing events, deliberately: it already
//  * merges overlapping events, honours recurrence, and — the part that matters —
//  * returns only opaque busy intervals. Listing events would hand this app every
//  * title, guest list and location in somebody's calendar, none of which it needs.
//  *
//  * @param accessToken - A valid access token.
//  * @param from        - Start of the range.
//  * @param to          - End of the range.
//  * @returns Busy intervals, or why not.
//  */
// export async function fetchBusyIntervals(
//   accessToken: string,
//   from: Date,
//   to: Date,
// ): Promise<GoogleResult<Array<{ start: string; end: string }>>> {
//   const result = await callApi<{
//     calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
//   }>(accessToken, `${CALENDAR_API}/freeBusy`, {
//     method: 'POST',
//     body: JSON.stringify({
//       timeMin: from.toISOString(),
//       timeMax: to.toISOString(),
//       items: [{ id: 'primary' }],
//     }),
//   });
//
//   if (!result.ok) {
//     return result;
//   }
//
//   return { ok: true, data: result.data.calendars?.primary?.busy ?? [] };
// }
//
// /*
//  * EVENT WRITES DISABLED — 2026-09-01. These are the two calls that pushed a
//  * study session into a student's Google Calendar and took it out again, and
//  * they are the only reason this app ever needed the `calendar.events` scope
//  * commented out above. Their single caller, write-sync.ts, is commented out
//  * too. Uncomment both, the scope, and write-sync.ts to bring the push back.
//  */
// // /**
// //  * Puts a study session on the calendar, marked busy.
// //  *
// //  * @param accessToken - A valid access token.
// //  * @param event       - What to write.
// //  * @returns The id Google assigned, or why not.
// //  */
// // export async function createEvent(
// //   accessToken: string,
// //   event: {
// //     title: string;
// //     description?: string;
// //     location?: string | null;
// //     startsAt: string;
// //     endsAt: string;
// //   },
// // ): Promise<GoogleResult<string>> {
// //   const result = await callApi<{ id?: string }>(
// //     accessToken,
// //     `${CALENDAR_API}/calendars/primary/events`,
// //     {
// //       method: 'POST',
// //       body: JSON.stringify({
// //         summary: event.title,
// //         description: event.description,
// //         location: event.location ?? undefined,
// //         start: { dateTime: event.startsAt },
// //         end: { dateTime: event.endsAt },
// //         /* The whole point of the write sync: this time is taken. */
// //         transparency: 'opaque',
// //         /*
// //          * No attendees. Adding them would email every classmate from the
// //          * student's own account and expose their addresses to each other — the
// //          * meeting already has its own invitations inside the app.
// //          */
// //         reminders: { useDefault: true },
// //       }),
// //     },
// //   );
// //
// //   if (!result.ok) {
// //     return result;
// //   }
// //
// //   return result.data.id
// //     ? { ok: true, data: result.data.id }
// //     : { ok: false, reason: 'request_failed', detail: 'no event id in response' };
// // }
// //
// // /**
// //  * Removes an event this app created.
// //  *
// //  * @param accessToken - A valid access token.
// //  * @param eventId     - The id stored when it was created.
// //  * @returns Success, or why not. An already-deleted event counts as success.
// //  */
// // export async function deleteEvent(
// //   accessToken: string,
// //   eventId: string,
// // ): Promise<GoogleResult<void>> {
// //   return callApi<void>(
// //     accessToken,
// //     `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}`,
// //     { method: 'DELETE' },
// //   );
// // }
