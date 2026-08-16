/**
 * File:        src/lib/ai/provider.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A single narrow entry point for talking to an LLM.
 *
 *              Implemented with `fetch` rather than a vendor SDK on purpose: the
 *              only call this project makes is "here is a prompt, give me back
 *              JSON", and an SDK per provider is a dependency and a migration
 *              cost for an interface this small.
 *
 *              Returns a discriminated result instead of throwing. An
 *              unconfigured or failing model is an expected state here — the app
 *              is designed to work without one — so callers have to handle it
 *              rather than being able to ignore an exception.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - `user` accepts content blocks, so a caller can send
 *                           an image or a PDF alongside its text
 *     0.10.0 - 2026-08-09 - Initial implementation (Smart Course API)
 */

import 'server-only';

import { isAiConfigured, serverEnv } from '@/lib/env';

export type AiResult =
  | { ok: true; text: string; model: string; latencyMs: number }
  | { ok: false; reason: 'not_configured' | 'request_failed' | 'empty'; detail?: string };

/**
 * A piece of a user turn.
 *
 * Only the three shapes this app actually sends. Images and documents are
 * inlined as base64 rather than uploaded first, because the file never needs to
 * outlive the one request that reads it — a stored file would be a second
 * lifecycle to manage, and a second thing to delete when a student leaves.
 */
export type AiContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | {
      type: 'document';
      source: { type: 'base64'; media_type: 'application/pdf'; data: string };
    };

/** Hard ceiling on a single call, so a hanging model cannot hang a request. */
const TIMEOUT_MS = 30_000;

/**
 * Asks the configured model to complete a prompt.
 *
 * @param options - `system` frames the task, `user` carries the request — plain
 *                  text, or content blocks when a file is part of it —
 *                  `maxTokens` caps the reply, and `timeoutMs` overrides the
 *                  default ceiling for calls that legitimately take longer.
 * @returns The model's text, or a reason it produced none.
 */
export async function completeJson(options: {
  system: string;
  user: string | AiContentBlock[];
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<AiResult> {
  if (!isAiConfigured()) {
    return { ok: false, reason: 'not_configured' };
  }

  const env = serverEnv();
  const model = env.AI_MODEL!;
  const startedAt = Date.now();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.AI_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.system,
        messages: [{ role: 'user', content: options.user }],
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    });

    if (!response.ok) {
      /*
       * The body may contain the key or other request detail, so it is logged
       * server-side and never returned to the caller.
       */
      console.error('[ai.completeJson] provider returned', response.status);
      return { ok: false, reason: 'request_failed', detail: `status ${response.status}` };
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const text = (payload.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return { ok: false, reason: 'empty' };
    }

    return { ok: true, text, model, latencyMs: Date.now() - startedAt };
  } catch (error) {
    console.error('[ai.completeJson] request threw:', error);
    return { ok: false, reason: 'request_failed' };
  }
}

/**
 * Extracts the first JSON object or array from a model reply.
 *
 * Models wrap JSON in prose or fences even when told not to. Slicing to the
 * outermost bracket pair is more reliable than insisting on clean output, and
 * the result is validated by a schema afterwards regardless.
 *
 * @param text - Raw model text.
 * @returns The parsed value, or null when nothing parseable was found.
 */
export function extractJson(text: string): unknown {
  const fenced = text.replace(/```(?:json)?/gi, '');
  const start = fenced.search(/[[{]/);

  if (start === -1) {
    return null;
  }

  const opening = fenced[start];
  const closing = opening === '[' ? ']' : '}';
  const end = fenced.lastIndexOf(closing);

  if (end <= start) {
    return null;
  }

  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}
