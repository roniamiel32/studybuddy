/**
 * File:        tests/unit/meeting-components.test.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 9G's two visible rules, asserted against the rendered DOM.
 *
 *              THE X IS THE WHOLE POINT OF THE STRIP TESTS. "Only once the
 *              session is over" is a render condition, and a render condition is
 *              the one kind of rule the integration suite cannot reach: the
 *              INSERT policy would still refuse an early dismissal, but the
 *              student would be clicking a button that silently failed. Both
 *              halves have to be checked in their own layer.
 *
 *              THE ACTIONS ARE MOCKED, deliberately and completely. They are
 *              'use server' modules that open a Supabase client from cookies;
 *              importing them for real drags next/headers into jsdom. What is
 *              being asserted here is which action the component calls and with
 *              what — the actions' own behaviour is the integration suite's job,
 *              and is covered there against real policies.
 *
 *              jsdom HAS NO <dialog>. showModal and close are stubbed below,
 *              which is why `open` is asserted as a property rather than by
 *              looking for the dialog role.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingView } from '@/features/meetings/meeting-view';

const dismissMeeting = vi.fn(async () => ({ ok: true as const, data: undefined }));
const setMeetingRsvp = vi.fn(async () => ({ ok: true as const, data: undefined }));
const cancelMeeting = vi.fn(async () => ({ ok: true as const, data: undefined }));

vi.mock('@/features/meetings/actions', () => ({
  dismissMeeting: (...args: unknown[]) => dismissMeeting(...(args as [])),
  setMeetingRsvp: (...args: unknown[]) => setMeetingRsvp(...(args as [])),
  cancelMeeting: (...args: unknown[]) => cancelMeeting(...(args as [])),
}));

const { MeetingChatCard } = await import('@/components/meetings/meeting-chat-card');
const { MeetingDetailsDialog } = await import('@/components/meetings/meeting-details-dialog');
const { MeetingStrip } = await import('@/components/meetings/meeting-strip');

/**
 * Builds a meeting view, with everything not under test held constant.
 *
 * @param overrides - The fields the test cares about.
 * @returns A meeting view.
 */
function meeting(overrides: Partial<MeetingView> = {}): MeetingView {
  const twoHours = 7_200_000;

  return {
    id: 'meeting-1',
    title: 'Recursion catch-up',
    location: 'Library, floor 2',
    /* Ahead by default, so a test about the finished case has to say so. */
    startsAt: new Date(Date.now() + 2 * twoHours).toISOString(),
    endsAt: new Date(Date.now() + 3 * twoHours).toISOString(),
    going: true,
    otherAttendees: 1,
    isOrganiser: false,
    hasFinished: false,
    createdAt: new Date(Date.now() - twoHours).toISOString(),
    bannerDismissed: false,
    ...overrides,
  };
}

/** A meeting that ended an hour ago. */
function finished(overrides: Partial<MeetingView> = {}): MeetingView {
  return meeting({
    startsAt: new Date(Date.now() - 10_800_000).toISOString(),
    endsAt: new Date(Date.now() - 3_600_000).toISOString(),
    hasFinished: true,
    ...overrides,
  });
}

beforeAll(() => {
  /* jsdom implements neither, and the dialog calls both. */
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MeetingChatCard', () => {
  it('shows the session title and time as one control', async () => {
    render(<MeetingChatCard meeting={meeting()} />);

    const card = screen.getByRole('button', { name: /Recursion catch-up/ });

    expect(card).toBeInTheDocument();
    /* One control, not a card with a button inside it — the arrow is a span. */
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('opens the details dialog when the card is clicked', async () => {
    const user = userEvent.setup();
    render(<MeetingChatCard meeting={meeting()} />);

    expect(document.querySelector('dialog')?.open).toBe(false);

    await user.click(screen.getByRole('button', { name: /Recursion catch-up/ }));

    expect(document.querySelector('dialog')?.open).toBe(true);
  });

  it('says so on the card when the viewer is not going', () => {
    render(<MeetingChatCard meeting={meeting({ going: false })} />);

    /* The separator is in the pattern on purpose: the dialog this card mounts
       has a "Not attending" button, and a looser match finds that instead. */
    expect(screen.getByText(/· Not attending/)).toBeInTheDocument();
  });

  it('stays in the feed after its banner has been dismissed', () => {
    /* The rule that separates the two surfaces. */
    render(<MeetingChatCard meeting={finished({ bannerDismissed: true })} />);

    expect(screen.getByRole('button', { name: /Recursion catch-up/ })).toBeInTheDocument();
  });
});

describe('MeetingDetailsDialog', () => {
  it('shows the place and who else is coming', () => {
    render(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting()} />);

    expect(screen.getByText('Library, floor 2')).toBeInTheDocument();
    expect(screen.getByText('1 other coming')).toBeInTheDocument();
  });

  it('marks the answer the viewer has already given', () => {
    render(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: true })} />);

    expect(screen.getByRole('button', { name: 'Attending' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Not attending' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sends the RSVP the button names', async () => {
    const user = userEvent.setup();
    render(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: true })} />);

    await user.click(screen.getByRole('button', { name: 'Not attending' }));

    await waitFor(() => {
      expect(setMeetingRsvp).toHaveBeenCalledWith({ meetingId: 'meeting-1', going: false });
    });
  });

  it('offers no RSVP once the session has finished, and explains why', () => {
    /*
     * Attendance is frozen by a database trigger from the moment a session
     * starts — the rule the Phase 7D rating system rests on. Offering buttons
     * the database would refuse is worse than a sentence.
     */
    render(<MeetingDetailsDialog open onClose={() => {}} meeting={finished()} />);

    expect(screen.queryByRole('button', { name: 'Attending' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not attending' })).not.toBeInTheDocument();
    expect(screen.getByText(/Attendance is fixed/)).toBeInTheDocument();
  });

  it('surfaces a refusal rather than pretending it saved', async () => {
    const user = userEvent.setup();
    setMeetingRsvp.mockResolvedValueOnce({
      ok: false,
      error: { message: 'This session has already started.' },
    } as never);

    render(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting()} />);
    await user.click(screen.getByRole('button', { name: 'Not attending' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This session has already started.',
    );
  });
});

describe('MeetingStrip', () => {
  it('draws no dismiss button before the session is over', () => {
    /*
     * The time restriction, in the layer the integration suite cannot see. The
     * policy would refuse the write anyway — this is what stops a student
     * clicking a control that silently fails.
     */
    render(<MeetingStrip meetings={[meeting()]} />);

    expect(screen.getByText('Recursion catch-up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Clear/ })).not.toBeInTheDocument();
  });

  it('draws it once the session has finished', () => {
    render(<MeetingStrip meetings={[finished()]} />);

    expect(
      screen.getByRole('button', { name: 'Clear Recursion catch-up from your chat' }),
    ).toBeInTheDocument();
  });

  it('dismisses the banner for the viewer alone', async () => {
    const user = userEvent.setup();
    render(<MeetingStrip meetings={[finished()]} />);

    await user.click(screen.getByRole('button', { name: /^Clear/ }));

    /* The meeting id and nothing else — no scope, no other participant. */
    await waitFor(() => {
      expect(dismissMeeting).toHaveBeenCalledWith({ meetingId: 'meeting-1' });
    });

    /* Optimistic: gone before the server has answered. */
    expect(screen.queryByText('Recursion catch-up')).not.toBeInTheDocument();
  });

  it('brings the banner back when the write is refused', async () => {
    const user = userEvent.setup();
    dismissMeeting.mockResolvedValueOnce({
      ok: false,
      error: { message: 'You can only clear a session once it has finished.' },
    } as never);

    render(<MeetingStrip meetings={[finished()]} />);
    await user.click(screen.getByRole('button', { name: /^Clear/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You can only clear a session');
    expect(screen.getByText('Recursion catch-up')).toBeInTheDocument();
  });

  it('hides a banner the viewer has already dismissed', () => {
    render(<MeetingStrip meetings={[finished({ bannerDismissed: true })]} />);

    expect(screen.queryByText('Recursion catch-up')).not.toBeInTheDocument();
  });

  it('hides one that finished more than a day ago', () => {
    render(
      <MeetingStrip
        meetings={[
          finished({ endsAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
        ]}
      />,
    );

    expect(screen.queryByText('Recursion catch-up')).not.toBeInTheDocument();
  });

  it('offers the organiser a way to call the whole thing off', async () => {
    const user = userEvent.setup();
    render(<MeetingStrip meetings={[meeting({ isOrganiser: true })]} />);

    await user.click(screen.getByRole('button', { name: 'Call it off' }));

    await waitFor(() => {
      expect(cancelMeeting).toHaveBeenCalledWith({ meetingId: 'meeting-1' });
    });
  });

  it('renders nothing at all when every session is out of the window', () => {
    const { container } = render(
      <MeetingStrip meetings={[finished({ bannerDismissed: true })]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
