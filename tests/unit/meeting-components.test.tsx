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
 *
 *              THE TOAST PROVIDER IS REAL, not mocked. The message the dialog
 *              raises when somebody steps out of a session — go and remove this
 *              from your own calendar — is the only thing that closes the loop
 *              on a manually added event, and asserting it through the real
 *              provider is what proves a student actually sees it.
 * Version:     0.53.0
 *
 * Modifications:
 *     0.53.0 - 2026-09-01 - Recurring sessions: the two cancel choices, and the
 *                           rule the calendar link carries
 *     0.50.0 - 2026-09-01 - The finished-session assertion follows the copy the
 *                           dialog actually shows
 *     0.49.0 - 2026-09-01 - Renders go through the toast provider, and the
 *                           cancellation message is asserted
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import type { ReactElement } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ToastProvider } from '@/components/ui/toast';
import type { MeetingView } from '@/features/meetings/meeting-view';

const dismissMeeting = vi.fn(async () => ({ ok: true as const, data: undefined }));
const setMeetingRsvp = vi.fn(async () => ({ ok: true as const, data: undefined }));
const cancelMeeting = vi.fn(async () => ({ ok: true as const, data: undefined }));
const cancelMeetingSeries = vi.fn(async () => ({ ok: true as const, data: 8 }));

vi.mock('@/features/meetings/actions', () => ({
  dismissMeeting: (...args: unknown[]) => dismissMeeting(...(args as [])),
  setMeetingRsvp: (...args: unknown[]) => setMeetingRsvp(...(args as [])),
  cancelMeeting: (...args: unknown[]) => cancelMeeting(...(args as [])),
  cancelMeetingSeries: (...args: unknown[]) => cancelMeetingSeries(...(args as [])),
}));

const { MeetingChatCard } = await import('@/components/meetings/meeting-chat-card');
const { MeetingDetailsDialog } = await import('@/components/meetings/meeting-details-dialog');
const { MeetingStrip } = await import('@/components/meetings/meeting-strip');

/**
 * Renders inside the toast provider.
 *
 * The details dialog calls useToast, which throws outside a provider — so every
 * render that mounts it, the chat card included, has to come through here.
 *
 * @param ui - The element under test.
 * @returns Testing Library's render result.
 */
function renderWithToasts(ui: ReactElement) {
  return render(ui, { wrapper: ToastProvider });
}

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
    seriesId: null,
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
    renderWithToasts(<MeetingChatCard meeting={meeting()} />);

    const card = screen.getByRole('button', { name: /Recursion catch-up/ });

    expect(card).toBeInTheDocument();
    /* One control, not a card with a button inside it — the arrow is a span. */
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('opens the details dialog when the card is clicked', async () => {
    const user = userEvent.setup();
    renderWithToasts(<MeetingChatCard meeting={meeting()} />);

    expect(document.querySelector('dialog')?.open).toBe(false);

    await user.click(screen.getByRole('button', { name: /Recursion catch-up/ }));

    expect(document.querySelector('dialog')?.open).toBe(true);
  });

  it('says so on the card when the viewer is not going', () => {
    renderWithToasts(<MeetingChatCard meeting={meeting({ going: false })} />);

    /* The separator is in the pattern on purpose: the dialog this card mounts
       has a "Not attending" button, and a looser match finds that instead. */
    expect(screen.getByText(/· Not attending/)).toBeInTheDocument();
  });

  it('stays in the feed after its banner has been dismissed', () => {
    /* The rule that separates the two surfaces. */
    renderWithToasts(<MeetingChatCard meeting={finished({ bannerDismissed: true })} />);

    expect(screen.getByRole('button', { name: /Recursion catch-up/ })).toBeInTheDocument();
  });
});

describe('MeetingDetailsDialog', () => {
  it('shows the place and who else is coming', () => {
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting()} />);

    expect(screen.getByText('Library, floor 2')).toBeInTheDocument();
    expect(screen.getByText('1 other coming')).toBeInTheDocument();
  });

  it('marks the answer the viewer has already given', () => {
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: true })} />);

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
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: true })} />);

    await user.click(screen.getByRole('button', { name: 'Not attending' }));

    await waitFor(() => {
      expect(setMeetingRsvp).toHaveBeenCalledWith({ meetingId: 'meeting-1', going: false });
    });
  });

  it('asks the student to clear their own calendar when they step out', async () => {
    /*
     * THE ONLY WAY BACK OUT OF A CALENDAR WE CANNOT REACH. The session is added
     * to Google by a plain template link, from the student's own browser, so
     * nothing on this side can delete the copy it created. Cancelling therefore
     * has to say so, and it has to say so in a toast — the dialog closes on
     * success, taking any sentence inside it with it.
     */
    const user = userEvent.setup();
    renderWithToasts(
      <MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: true })} />,
    );

    await user.click(screen.getByRole('button', { name: 'Not attending' }));

    expect(
      await screen.findByText(/remember to remove it there as well/),
    ).toBeInTheDocument();
  });

  it('says nothing about calendars when the answer is yes', async () => {
    const user = userEvent.setup();
    renderWithToasts(
      <MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ going: false })} />,
    );

    await user.click(screen.getByRole('button', { name: 'Attending' }));

    await waitFor(() => {
      expect(setMeetingRsvp).toHaveBeenCalledWith({ meetingId: 'meeting-1', going: true });
    });

    expect(
      screen.queryByText(/remember to remove it there as well/),
    ).not.toBeInTheDocument();
  });

  it('offers no RSVP once the session has finished, and explains why', () => {
    /*
     * Attendance is frozen by a database trigger from the moment a session
     * starts — the rule the Phase 7D rating system rests on. Offering buttons
     * the database would refuse is worse than a sentence.
     */
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={finished()} />);

    expect(screen.queryByRole('button', { name: 'Attending' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Not attending' })).not.toBeInTheDocument();
    /* `finished()` is going: true, so the dialog reports attendance in the past
       tense rather than offering an answer. */
    expect(screen.getByText('You attended this session.')).toBeInTheDocument();
  });

  it('surfaces a refusal rather than pretending it saved', async () => {
    const user = userEvent.setup();
    setMeetingRsvp.mockResolvedValueOnce({
      ok: false,
      error: { message: 'This session has already started.' },
    } as never);

    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting()} />);
    await user.click(screen.getByRole('button', { name: 'Not attending' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This session has already started.',
    );
  });
});

describe('a session that repeats', () => {
  /** The same meeting, as one sitting of a weekly series. */
  const weekly = (overrides: Partial<MeetingView> = {}) =>
    meeting({ seriesId: 'series-1', ...overrides });

  it('says so in the dialog, and hands Google the rule', () => {
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={weekly()} />);

    expect(screen.getByText('Repeats weekly')).toBeInTheDocument();

    /*
     * THE POINT OF THE MANUAL INTEGRATION. We cannot write to a calendar, but
     * the template URL takes an RRULE and Google expands it — so one press adds
     * every Tuesday rather than one Tuesday and seven jobs for later.
     */
    const link = screen.getByRole('link', { name: /Add weekly to Google Calendar/ });

    expect(link).toHaveAttribute('href', expect.stringContaining('recur=RRULE'));
    expect(link).toHaveAttribute('href', expect.stringContaining('FREQ%3DWEEKLY'));
  });

  it('sends no rule for a one-off', () => {
    renderWithToasts(<MeetingDetailsDialog open onClose={() => {}} meeting={meeting()} />);

    const link = screen.getByRole('link', { name: 'Add to Google Calendar' });

    expect(link.getAttribute('href')).not.toContain('recur=');
    expect(screen.queryByText('Repeats weekly')).not.toBeInTheDocument();
  });

  it('offers the organiser both endings, and they do different things', async () => {
    const user = userEvent.setup();
    render(<MeetingStrip meetings={[weekly({ isOrganiser: true })]} />);

    /*
     * TWO NAMED CHOICES RATHER THAN ONE AMBIGUOUS BUTTON. They are not equally
     * undoable — this Tuesday can be rebooked in a press, eight weeks of them
     * cannot — so neither may be the default reading of "Call it off".
     */
    await user.click(screen.getByRole('button', { name: 'Call off this one' }));

    await waitFor(() => {
      expect(cancelMeeting).toHaveBeenCalledWith({ meetingId: 'meeting-1' });
    });
    expect(cancelMeetingSeries).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Stop repeating' }));

    await waitFor(() => {
      expect(cancelMeetingSeries).toHaveBeenCalledWith({ meetingId: 'meeting-1' });
    });
  });

  it('offers the same two endings in the dialog, where a future sitting is reached', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithToasts(
      <MeetingDetailsDialog
        open
        onClose={onClose}
        meeting={weekly({ isOrganiser: true })}
      />,
    );

    /*
     * THE BANNER IS NOT ENOUGH. It carries what is imminent; a series booked for
     * the next eight Tuesdays is reached through its card in the thread, which
     * opens this dialog. Without these the organiser could not stop a series
     * until its next sitting was nearly upon them.
     */
    await user.click(screen.getByRole('button', { name: 'Stop repeating' }));

    await waitFor(() => {
      expect(cancelMeetingSeries).toHaveBeenCalledWith({ meetingId: 'meeting-1' });
    });

    /* It closes on success, like every other answer this dialog takes. */
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no endings in the dialog for a one-off, or to a guest', () => {
    const { unmount } = renderWithToasts(
      <MeetingDetailsDialog open onClose={() => {}} meeting={meeting({ isOrganiser: true })} />,
    );

    expect(screen.queryByRole('button', { name: 'Stop repeating' })).not.toBeInTheDocument();
    unmount();

    renderWithToasts(
      <MeetingDetailsDialog open onClose={() => {}} meeting={weekly({ isOrganiser: false })} />,
    );

    expect(screen.queryByRole('button', { name: 'Stop repeating' })).not.toBeInTheDocument();
  });

  it('leaves a one-off with the single ending it always had', () => {
    render(<MeetingStrip meetings={[meeting({ isOrganiser: true })]} />);

    expect(screen.getByRole('button', { name: 'Call it off' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop repeating' })).not.toBeInTheDocument();
  });

  it('offers no ending at all to somebody who did not book it', () => {
    render(<MeetingStrip meetings={[weekly({ isOrganiser: false })]} />);

    /* Stepping out is their own rsvp. One person not coming any more is not the
       series ending for everybody. */
    expect(screen.queryByRole('button', { name: 'Stop repeating' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Call off this one' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cannot make it' })).toBeInTheDocument();
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
