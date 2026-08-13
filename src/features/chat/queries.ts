/**
 * File:        src/features/chat/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the Messages list and the chat room.
 *
 *              Every query here runs as the signed-in student, so the Phase 3
 *              policies have already narrowed the rows to conversations they are
 *              part of before this code sees one. The `.eq()` filters below are
 *              therefore a second layer rather than the only one — the same
 *              belt-and-braces the rest of the app uses.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { ChatMessageView, ConversationView } from './chat-view';

/** Columns needed to render a conversation row, in one round trip. */
const CONVERSATION_SELECT = `
  id,
  participant_a,
  participant_b,
  last_message_at,
  course_offerings ( courses ( code, name ) ),
  a:profiles!conversations_participant_a_fkey ( id, full_name, avatar_url, degrees ( name ) ),
  b:profiles!conversations_participant_b_fkey ( id, full_name, avatar_url, degrees ( name ) )
`;

interface ConversationRow {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string;
  course_offerings: { courses: { code: string; name: string } | null } | null;
  a: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    degrees: { name: string } | null;
  } | null;
  b: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    degrees: { name: string } | null;
  } | null;
}

/**
 * Turns a joined row into the view model, from one participant's perspective.
 *
 * A conversation has no inherent "other person" — which of the two it is
 * depends entirely on who is looking, which is why this takes the viewer.
 *
 * @param row      - The joined conversation row.
 * @param viewerId - The signed-in student.
 * @returns The conversation as that viewer sees it.
 */
function toConversationView(row: ConversationRow, viewerId: string): ConversationView {
  const partner = row.participant_a === viewerId ? row.b : row.a;
  const course = row.course_offerings?.courses ?? null;

  return {
    id: row.id,
    partnerId: (row.participant_a === viewerId ? row.participant_b : row.participant_a),
    /* A profile with no name is possible mid-onboarding; "Classmate" is better
       than an empty header. */
    partnerName: partner?.full_name ?? 'Classmate',
    partnerAvatarUrl: partner?.avatar_url ?? null,
    partnerDegreeName: partner?.degrees?.name ?? null,
    courseCode: course?.code ?? null,
    courseName: course?.name ?? null,
    lastMessageAt: row.last_message_at,
    lastMessageBody: null,
    lastMessageFromMe: false,
    unreadCount: 0,
  };
}

/**
 * The caller's conversations, newest activity first.
 *
 * Three queries rather than one view: the conversations, then the last message
 * of each, then the unread counts. A single SQL statement could do it with
 * lateral joins, but it would have to live in a database function, and the
 * ordering and previews are display concerns that change with the design. The
 * message queries are bounded by the number of conversations a student has,
 * which is small.
 *
 * @returns Conversations with their preview line and unread count.
 */
export async function getConversations(): Promise<ConversationView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(`participant_a.eq.${user.id},participant_b.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error || !rows || rows.length === 0) {
    return [];
  }

  const conversations = (rows as unknown as ConversationRow[]).map((row) =>
    toConversationView(row, user.id),
  );
  const ids = conversations.map((conversation) => conversation.id);

  /*
   * Newest message per conversation, taken from one ordered read. Asking the
   * database for "the last message of each" needs a window function and a view;
   * for a student's handful of threads, reading them ordered and keeping the
   * first of each is simpler and costs one query either way.
   */
  const { data: recent } = await supabase
    .from('messages')
    .select('conversation_id, body, sender_id, created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: false });

  const previews = new Map<string, { body: string; senderId: string }>();
  for (const message of recent ?? []) {
    if (!previews.has(message.conversation_id)) {
      previews.set(message.conversation_id, {
        body: message.body,
        senderId: message.sender_id,
      });
    }
  }

  /* Unread means: from the other person, and not yet opened. */
  const { data: unread } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', ids)
    .eq('is_read', false)
    .neq('sender_id', user.id);

  const unreadCounts = new Map<string, number>();
  for (const message of unread ?? []) {
    unreadCounts.set(
      message.conversation_id,
      (unreadCounts.get(message.conversation_id) ?? 0) + 1,
    );
  }

  return conversations.map((conversation) => {
    const preview = previews.get(conversation.id);

    return {
      ...conversation,
      lastMessageBody: preview?.body ?? null,
      lastMessageFromMe: preview?.senderId === user.id,
      unreadCount: unreadCounts.get(conversation.id) ?? 0,
    };
  });
}

/**
 * One conversation, or null when it is not the caller's to read.
 *
 * Null rather than a thrown error for a conversation that exists but belongs to
 * someone else: RLS returns no row, and the page turns that into a 404. A
 * "forbidden" would confirm the conversation exists, which is more than a
 * stranger should learn.
 *
 * @param conversationId - The conversation to read.
 * @returns The conversation, or null.
 */
export async function getConversation(
  conversationId: string,
): Promise<ConversationView | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', conversationId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toConversationView(data as unknown as ConversationRow, user.id);
}

/**
 * Every message in a conversation, oldest first.
 * Filters out messages the user has explicitly dismissed/hidden.
 *
 * @param conversationId - The conversation to read.
 * @returns Messages in send order, excluding hidden ones.
 */
export async function getMessages(conversationId: string): Promise<ChatMessageView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  /* 1. שולפים את מזהי ההודעות שהמשתמש הנוכחי הסתיר */
 const { data: hiddenData } = await (supabase.from('hidden_messages' as any) as any)
    .select('message_id')
    .eq('profile_id', user.id);

  const hiddenIds = (hiddenData ?? []).map((row:any) => row.message_id);

  /* 2. בונים את השאילתה לשליפת הודעות הצ'אט */
  let query = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, is_read, read_at, is_icebreaker, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  /* 3. מסננים החוצה הודעות שהוסתרו על ידי המשתמש */
  if (hiddenIds.length > 0) {
    query = query.not('id', 'in', `(${hiddenIds.join(',')})`);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data.map((message) => ({
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    body: message.body,
    isRead: message.is_read,
    readAt: message.read_at,
    isIcebreaker: message.is_icebreaker,
    createdAt: message.created_at,
  }));
}

/**
 * How many messages the caller has not read.
 *
 * Counted with `head: true`, so the database returns the number and no rows —
 * the navigation badge needs a total, not the messages themselves. RLS scopes
 * this to the caller's own conversations.
 *
 * @returns The unread total across every conversation.
 */
export async function getUnreadCount(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false)
    .neq('sender_id', user.id);

  return count ?? 0;
}

/**
 * The conversation with a given student, if one exists.
 *
 * Used before starting a new one, so pressing "Send message" on a match you
 * have already written to opens that thread instead of failing on the
 * one-per-pair unique index.
 *
 * @param partnerId - The other student.
 * @returns The conversation id, or null.
 */
export async function findConversationWith(partnerId: string): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${user.id},participant_b.eq.${partnerId}),` +
        `and(participant_a.eq.${partnerId},participant_b.eq.${user.id})`,
    )
    .maybeSingle();

  return data?.id ?? null;
}
