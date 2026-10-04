# Conversations UI: 2026-10-04

The operator asked to finish the agreed green-and-white chat experience before
continuing the product specification from section 110 onward. The supplied
reference has an isolated inbox, direct chats, a room thread and a Home entry
back into the marketplace. The existing spec still has only a heading at 110.

## Connected UI

- Full-screen conversations, separate from marketplace chrome and profile panels.
- Responsive desktop inbox/thread panes and mobile list/detail navigation.
- Existing canonical inbox data, unread filters, search, avatars and empty/error states.
- New-message lookup uses the existing public-profile API, then the same
  conversation-selection path. It never sends a message from the lookup dialog.
- Home, profile and notification actions use existing application navigation.
- The composer retains encrypted-send enforcement, draft persistence, retries,
  explicit receipts, attachments, recovery and device-security controls.
- Newest-message scrolling and retained history/inbox position during panel
  replacement. The mobile pane follows the visual viewport when the keyboard opens.
- Commerce remains available in a collapsed section, not mixed into the chat header.

## Room Boundary

The room tab is an honest empty state: this repository has no authenticated
room-list, membership or group-send service yet. No fake production rooms,
online counts, typing signals, reactions or calling controls were introduced.

`renderChatroomLayout` is a read-only presentation component for the agreed
room screen: members, administrator labels, a pinned-message link and named
senders. Only browser tests supply synthetic room data. It is not connected to
production navigation, and its composer is disabled. It has no private-chat form
ID or receipt marker, so it cannot accidentally use pairwise send/ACK endpoints.
Server membership, ciphertext transport, group receipts and room management
must follow the supplied product spec before this screen becomes interactive.

## Verification And Release

The dedicated `test:chat-ui` runner exercises the real presentation/controller
with synthetic data and an isolated API stub, including cancellation on account
or session change, invalid contact results, reduced keyboard viewport, desktop,
small mobile and RTL layout. These are not authenticated production acceptance.
The authenticated encrypted-browser workflow remains a separate regression gate.

Verified locally on 2026-10-04:

- `test:chat-ui`: 11/11, with screenshots for desktop, mobile, small mobile,
  RTL and read-only room presentation. Header icon hit targets remain 44px.
- Full-app inbox/navigation regressions: 4/4, including real local message
  submission, dismissing the post-send notification prompt, hidden marketplace
  chrome inside chats, and restoring it on Home.
- Authenticated encrypted-browser regression: passed, including ciphertext-only
  transport, sent/delivered/read receipts, exact retries, offline encrypted files,
  decrypted preview safety and fresh-device history recovery. This uses a local
  database and synthetic private storage, not production accounts or R2.
- Frontend regression suite and four-locale catalog/string gates: passed.
- Static build and 81-module bundle consistency: passed.

Screenshot conversations are synthetic fixtures. Production conversations still
come only from the existing authenticated inbox and history APIs.

No production flags, secrets, schemas or server authorization policies change
in this UI increment. Preview and operator design approval precede publishing
this layout; section 110 requirements and independent crypto audit remain open.
