# The Groups tab is retired, not deleted

Phase 9D moved the two things this tab held to the tabs that were already about
the same things:

- **Join requests** → the Notifications tab, which is where everything else
  waiting on you already lives. It renders the same `ApplicantRow` component,
  so the card, the "Pending" chip and the "Review" dialog are unchanged.
- **Group chats** → the Messages tab, alongside personal conversations.

`/groups/[groupId]` — the group chat view with its members sidebar, study
sessions and message board — **is still live**. It is what a group row in
Messages opens. Only the *list* page was retired.

## To restore the tab

1. Rename `page.tsx.disabled` back to `page.tsx`.
2. In `src/components/layout/app-nav.tsx`, uncomment the `/groups` entry in
   `DESTINATIONS` and add `Users` back to the `lucide-react` import.

Nothing else was removed: `getMyGroups`, `getMyPendingRequests`,
`getMyInvitations`, `InvitationInbox`, `ApplicantRow` and `GroupCard` are all
still in the tree and still used elsewhere.
