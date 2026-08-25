/**
 * File:        tests/e2e/helpers/mailbox.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reading the local mail server, so the tests can follow a code or
 *              a link the way a student would.
 *
 *              `supabase start` runs Mailpit and every auth email lands there
 *              instead of being sent. Asking it what arrived is the only honest
 *              way to test the confirmation step: minting a token with the admin
 *              API would prove that verifyOtp works and skip the part that
 *              actually breaks, which is whether the template carries the code
 *              at all.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

const MAILBOX_URL = process.env.SUPABASE_INBUCKET_URL ?? 'http://127.0.0.1:54324';

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

/**
 * Waits for the newest message sent to an address.
 *
 * Polls rather than waiting a fixed time: the email is sent during the request
 * that created the account, but it reaches Mailpit a moment after the browser
 * has already moved on.
 *
 * @param address      - Who the message was sent to.
 * @param timeoutMs    - How long to keep looking.
 * @returns The message body, text preferred, falling back to the HTML.
 * @throws Error when nothing arrives in time.
 */
export async function waitForEmail(address: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const target = address.toLowerCase();

  while (Date.now() < deadline) {
    const response = await fetch(`${MAILBOX_URL}/api/v1/messages?limit=50`);

    if (response.ok) {
      const { messages } = (await response.json()) as { messages: MailpitSummary[] };

      /* Newest first, which is what Mailpit returns — so the first match is the
         most recent email to that address rather than a stale one from an
         earlier step in the same test. */
      const match = messages.find((message) =>
        message.To?.some((recipient) => recipient.Address.toLowerCase() === target),
      );

      if (match) {
        const detail = await fetch(`${MAILBOX_URL}/api/v1/message/${match.ID}`);
        const body = (await detail.json()) as { Text?: string; HTML?: string };

        return body.Text || body.HTML || '';
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`No email arrived for ${address} within ${timeoutMs}ms`);
}

/**
 * Pulls the six-digit confirmation code out of a sign-up email.
 *
 * @param address - Who the code was sent to.
 * @returns The code.
 * @throws Error when the email has no code in it, which is what a template that
 *         lost its {{ .Token }} looks like.
 */
export async function waitForVerificationCode(address: string): Promise<string> {
  const body = await waitForEmail(address);
  const code = /\b(\d{6})\b/.exec(body)?.[1];

  if (!code) {
    throw new Error(`No six-digit code in the email to ${address}`);
  }

  return code;
}

/**
 * Pulls the password-reset link out of an email.
 *
 * @param address - Who the link was sent to.
 * @returns The absolute URL to follow.
 * @throws Error when the email carries no link.
 */
export async function waitForResetLink(address: string): Promise<string> {
  const body = await waitForEmail(address);
  const link = /https?:\/\/[^\s"'<>]+/.exec(body)?.[0];

  if (!link) {
    throw new Error(`No link in the email to ${address}`);
  }

  /* Mailpit escapes ampersands in the HTML part, and following the escaped URL
     drops every query parameter after the first. */
  return link.replace(/&amp;/g, '&');
}

/**
 * Empties the mailbox.
 *
 * Between tests that each expect "the newest email to this address", a mailbox
 * carried over from a previous run is the difference between reading this
 * test's code and the last one's.
 *
 * @returns Nothing.
 */
export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILBOX_URL}/api/v1/messages`, { method: 'DELETE' });
}
