/**
 * File:        src/app/api/icebreaker/route.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Smart Icebreaker API.
 *
 *              POST { partnerId, courseOfferingId? } -> opens the conversation
 *              with that student and sends a generated first message.
 *
 *              A route handler rather than a server action for the same reasons
 *              as /api/courses: it is slow because it calls a model, it needs
 *              its own rate limit, and the button wants a loading state.
 *
 *              IT ALWAYS ENDS IN A CONVERSATION. With no model configured, or
 *              with one that fails, it sends a plainer opener built from the
 *              same shared context rather than returning an error. A student who
 *              presses "Send message" and lands nowhere has been told the
 *              feature is broken.
 *
 *              THE AUTHORISATION IS THE POLICIES, NOT THIS FILE. The
 *              conversation is inserted through the CALLER'S client, so the
 *              Phase 3 insert policy decides whether they may open a thread with
 *              this person — same university, and someone the matches list would
 *              have shown them. There is no hand-written permission check here to
 *              drift out of step with it.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import { NextResponse } from 'next/server';

import {
  fallbackIcebreaker,
  generateIcebreaker,
  sharedPreferenceNotes,
  type IcebreakerContext,
} from '@/features/chat/icebreaker';
import { icebreakerRequestSchema } from '@/features/chat/schema';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAiConfigured, serverEnv } from '@/lib/env';

export interface IcebreakerResponse {
  /** Where to go next. Present whenever a conversation exists. */
  conversationId?: string;
  /** How the opener was written, so the UI can label it honestly. */
  origin: 'generated' | 'fallback' | 'existing' | 'unavailable';
  message?: string;
  error?: string;
}

/** First name only: it is what the message says, and all the model is given. */
function firstNameOf(fullName: string | null): string {
  return fullName?.trim().split(/\s+/)[0] ?? 'there';
}

/**
 * Whether this student may make another icebreaker call today.
 *
 * Scoped to the icebreaker task, so it cannot exhaust — or be exhausted by — the
 * course-generation budget.
 *
 * @param profileId - The caller.
 * @returns True when they are under the cap.
 */
async function withinDailyCap(profileId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count } = await createAdminClient()
    .from('ai_generation_log')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('task', 'icebreaker')
    .gte('created_at', since);

  return (count ?? 0) < serverEnv().AI_ICEBREAKER_DAILY_LIMIT;
}

/**
 * Collects what the two students have in common.
 *
 * Course names come from the enrollments both sides hold, read through the
 * caller's client so RLS decides what is visible. Nothing here is personal
 * beyond a first name — see the note at the top of icebreaker.ts.
 *
 * @param supabase  - The caller's client.
 * @param viewerId  - The sender.
 * @param partnerId - The recipient.
 * @returns Names and shared context for the prompt.
 */
async function buildContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  partnerId: string,
): Promise<{ context: IcebreakerContext; partnerName: string | null } | null> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', [viewerId, partnerId]);

  const me = profiles?.find((profile) => profile.id === viewerId);
  const partner = profiles?.find((profile) => profile.id === partnerId);

  if (!partner) {
    /* Not visible to the caller, so as far as they are concerned it does not exist. */
    return null;
  }

  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('profile_id, course_offerings ( courses ( name ) )')
    .in('profile_id', [viewerId, partnerId]);

  const coursesOf = (id: string) =>
    (enrollments ?? [])
      .filter((row) => row.profile_id === id)
      .map((row) => row.course_offerings?.courses?.name)
      .filter((name): name is string => Boolean(name));

  const mine = coursesOf(viewerId);
  const theirs = new Set(coursesOf(partnerId));
  const sharedCourses = [...new Set(mine.filter((name) => theirs.has(name)))];

  const { data: preferences } = await supabase
    .from('learning_preferences')
    .select('profile_id, preferred_time_blocks, study_environments, group_sizes')
    .in('profile_id', [viewerId, partnerId]);

  const preferencesOf = (id: string) => {
    const row = preferences?.find((preference) => preference.profile_id === id);

    return {
      preferredTimeBlocks: row?.preferred_time_blocks ?? [],
      studyEnvironments: row?.study_environments ?? [],
      groupSizes: row?.group_sizes ?? [],
    };
  };

  return {
    partnerName: partner.full_name,
    context: {
      senderFirstName: firstNameOf(me?.full_name ?? null),
      recipientFirstName: firstNameOf(partner.full_name),
      sharedCourses,
      sharedPreferences: sharedPreferenceNotes(
        preferencesOf(viewerId),
        preferencesOf(partnerId),
      ),
    },
  };
}

/**
 * Opens a conversation and sends the opener.
 *
 * @param request - Carries `{ partnerId, courseOfferingId? }`.
 * @returns The conversation to open, and how its first message was written.
 */
export async function POST(request: Request): Promise<NextResponse<IcebreakerResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ origin: 'unavailable', error: 'Sign in first.' }, { status: 401 });
  }

  let partnerId: string;
  let courseOfferingId: string | undefined;

  try {
    ({ partnerId, courseOfferingId } = icebreakerRequestSchema.parse(await request.json()));
  } catch {
    return NextResponse.json(
      { origin: 'unavailable', error: 'A classmate is required.' },
      { status: 400 },
    );
  }

  if (partnerId === user.id) {
    return NextResponse.json(
      { origin: 'unavailable', error: 'You cannot message yourself.' },
      { status: 400 },
    );
  }

  /*
   * Already talking? Open that thread.
   *
   * Checked before generating, so pressing the button twice does not spend a
   * model call, and does not collide with conversations_one_per_pair_idx.
   */
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${user.id},participant_b.eq.${partnerId}),` +
        `and(participant_a.eq.${partnerId},participant_b.eq.${user.id})`,
    )
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ conversationId: existing.id, origin: 'existing' });
  }

  const built = await buildContext(supabase, user.id, partnerId);

  if (!built) {
    return NextResponse.json(
      { origin: 'unavailable', error: 'That classmate is not available.' },
      { status: 404 },
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('university_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { origin: 'unavailable', error: 'Finish setting up your profile first.' },
      { status: 403 },
    );
  }

  /*
   * The conversation is created through the caller's own client, so the insert
   * policy is the authorisation: same university, and someone
   * app_can_see_profile would show them. A blocked or hidden student fails here.
   */
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert({
      participant_a: user.id,
      participant_b: partnerId,
      university_id: profile.university_id,
      course_offering_id: courseOfferingId ?? null,
    })
    .select('id')
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json(
      {
        origin: 'unavailable',
        error: 'We could not start that conversation. They may not be available to message.',
      },
      { status: 403 },
    );
  }

  /* Generate only when there is a model and budget for one. */
  let body = fallbackIcebreaker(built.context);
  let origin: IcebreakerResponse['origin'] = 'fallback';
  let model: string | null = null;

  if (isAiConfigured() && (await withinDailyCap(user.id))) {
    const outcome = await generateIcebreaker(built.context);

    await createAdminClient()
      .from('ai_generation_log')
      .insert({
        profile_id: user.id,
        task: 'icebreaker',
        model: outcome.ok ? outcome.model : (serverEnv().AI_MODEL ?? 'unconfigured'),
        latency_ms: outcome.ok ? outcome.latencyMs : null,
        status: outcome.ok
          ? 'ok'
          : outcome.reason === 'invalid_output'
            ? 'invalid_output'
            : 'error',
        error_message: outcome.ok ? null : outcome.reason,
      });

    if (outcome.ok) {
      body = outcome.message;
      origin = 'generated';
      model = outcome.model;
    }
  }

  const { error: messageError } = await supabase.from('messages').insert({
    conversation_id: conversation.id,
    sender_id: user.id,
    body,
    /*
     * Only a model's words are marked as an icebreaker. The fallback is a
     * sentence assembled from two facts the sender already knew, so labelling it
     * "AI" would be a lie in the other direction.
     */
    is_icebreaker: origin === 'generated',
    model,
  });

  if (messageError) {
    /*
     * The conversation exists and the message does not. Left in place rather
     * than rolled back: the student can type their own opener, which is a
     * better outcome than losing the thread and having to press the button
     * again. Reported honestly so the UI does not claim a message was sent.
     */
    return NextResponse.json({
      conversationId: conversation.id,
      origin: 'unavailable',
      error: 'We opened the conversation but could not send the first message.',
    });
  }

  return NextResponse.json({ conversationId: conversation.id, origin, message: body });
}
