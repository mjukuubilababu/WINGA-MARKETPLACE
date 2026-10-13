# Share to Winga recipient discovery

The existing picker only offered recent inbox rows marked encrypted and ready
Shopping Rooms. A person without a Room or an established encrypted conversation
could not discover an individual recipient. The unified Share entry already
existed, so this change extends its picker and canonical social API.

Share to Winga now always shows a search input, up to 20 recent people and up to
30 current ready Rooms. Search matches public names/usernames and filters those
Rooms by name. An empty history can discover people after two characters. It
never searches or reveals private Rooms outside the sender's memberships.
An explicit product invitation uses the existing external sharing action and
only public product context; recipient search text is excluded from links.

The authenticated `/api/social/people?q=...&limit=...` endpoint uses the current
session's actor, excludes self, inactive/staff accounts and either direction of
canonical user blocks, and returns only username, public name and profile image.
It rejects actor overrides, bounds results to 30, uses parameterized literal
matching, private/no-store responses and the existing per-session/IP rate limiter
(60 requests per window). It does not collect search demand or message bodies.
No schema migration, new invitation system or new message transport is required.

Choosing a person sends the existing encrypted rich card. A first conversation
may require the native chat security flow and peer verification. That existing
verification is not auto-accepted. Only an explicitly selected pending share can
resume after active membership, with its original client message ID. Failed
attempts retain the same ID across search/filter changes; accepted/queued choices
cannot be sent again in the same picker. Recipient selection never falls back to
plaintext. Room commands still enforce canonical membership and authorization.

Search is debounced, has a bounded timeout, ignores stale responses, and preserves
matching recent destinations on outage. Closing the picker or changing the
account/session cancels pending work and its owned native security dialogs.
Analytics failure remains independent of destination access and sending.

Validation: PGlite checks both block directions, active actors, buyer discovery,
privacy, literal SQL matching and bounded output. Real HTTP tests check guest
rejection, session actor spoofing and database-unavailable failure. Browser tests
exercise empty history, rich-card selection, stable retries, out-of-order search,
ready Room filtering, search outage, public invitations, native setup, and
session-change cleanup. Discovery/send stubs verify UI wiring; they do not claim
actual live participant delivery or completion of the production growth canary.

Rollout uses the existing internal Share entry and canonical Render API plus the
Cloudflare frontend. Rollback reverts this release on both services; existing
public product links and messaging records remain valid. No migration rollback
is needed. Full Growth Loops readiness still depends on the separate spec evidence
and live canary gates.

## Winga visual experience

The Share entry and recipient picker now share an orange/ink visual identity,
compact product context, purpose-led copy and clear internal/external actions.
Recipients use public avatars or initials, with a distinct Room treatment. All,
People and Room filters reuse the same canonical discovery sources; filtering
Rooms performs no people lookup. Empty states describe the selected scope.
Mobile uses a full-width bottom sheet; desktop uses a centered dialog. RTL,
keyboard focus, reduced motion, bounded scrolling and small-text contrast are
handled within the sharing surfaces. No recommendations, online status, private
activity or growth statistics are invented.

The existing 27 sharing browser cases pass with the new presentation, including
filter continuity. Visual inspection covers 390px mobile, 1280px desktop and
320px RTL layouts, empty search and native security dialog cleanup. Screenshot
recipients and Rooms are local fixtures, not live participation evidence.

The canonical localization loader uses the validated deployed build stamp in
catalog URLs, so returning browsers receive the matching copy without clearing
their existing cache. Same-release requests remain deduplicated and cached.
