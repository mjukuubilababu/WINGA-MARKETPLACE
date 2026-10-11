# Growth Phase 2: authenticated internal product sharing

Prepared after the frontend release of `c9011955c66fb6fbc7b6d0297ccdaf9d2ee0faa3`.
That release is live on Worker `mkubwa`, version
`3d9d6ddc-43d6-425f-8e06-c5eb3325a7fa`, build `20261011184243`.
Its full acceptance run is
https://github.com/mjukuubilababu/WINGA-MARKETPLACE/actions/runs/38165406397.
All four jobs passed; real PostgreSQL 119/119 with zero skips, actual CodeQL
50 reviewed/zero unreviewed, encrypted browser 49/49 and guest Growth browser
2/2. Public manifest and five asset hashes were checked after deployment.
Both version bindings advanced; other Worker variables, Growth configuration
and CSP directives were preserved. CSP comparison normalizes only the existing
per-response nonces. Render backend remains at two instances and Phoenix at
one. No backend deployment, merge, device approval or verifier rerun occurred.

## Audited owners and bounded increment

The preceding `growth-loops-continuation-audit-20261011.md` identified existing
encrypted rich product references and Shopping Room product commands, but no
product-surface destination picker. This increment connects those canonical
owners rather than creating another messaging or invite service.

Authenticated product quick actions now include **Share to Winga**. The picker
reads recent canonical inbox contacts and eligible existing Rooms. It shows
recipient/Room labels, without message previews. The user chooses one destination
and explicitly confirms. Opening, selecting or closing the picker sends nothing.
Guests retain the existing external sharing and product-first experience.

Direct sharing uses `WingaRichContent.create('product', '', {ids: [productId]})`
and `sendRichMessage`, which still requires the canonical encrypted writer.
An optional caller-supplied action ID preserves retries; older callers still
receive an automatically generated UUID. Room sharing uses the existing
`shoppingRoom('command', [roomId, 'product-share', {productId, note: '',
snapshot: null}, actionId])`. Canonical membership, device trust, encryption,
blocks and rate limits remain authoritative.

The picker binds to the initiating account, device session and auth token in
memory. It closes after logout/session replacement or when the page is hidden.
Late reads and callbacks cannot populate another picker or close its UI.
Pending/revoked/departing/inaccessible/archived Rooms and malformed destination
identities are excluded. The server rechecks authorization before accepting a
write; this UI filter grants no membership or trust.

Each attempted action retains its destination and UUID after an uncertain
response. Repeated clicks are disabled. Retry uses the same canonical ID and
content, allowing existing durable send intent/server dedupe to converge.
Failure does not claim that a message was delivered or that history is unchanged.
One failed destination read does not block the other type. Error copy is generic;
provider details and auth credentials are not rendered or persisted by the picker.

Internal product commands are not recorded as external organic share creation
or verified recipient conversion. This increment adds no public Room tokens,
guest membership, notifications, private message analytics or Growth flag changes.

## Local evidence and limits

- New mobile Chromium picker checks: 14/14, including explicit consent, Room
  command shape, stable retry, repeated clicks, late completion, account/session
  changes, malformed destinations, text-only labels, read failure isolation,
  closing and Arabic viewport layout.
- Existing rich-chat Chromium checks: 11/11.
- Growth contracts: 44/44 (policy/share 8, runtime/app handlers 20, PGlite 16).
- Canonical encrypted inbox/client checks: 10/10, including explicit/default IDs.
- Frontend core 145/145 and behavior 80/80; link/offline retry regressions passed.
- Four localization catalogs have 1,637 matching keys; new hardcoded debt zero.
- Generated frontend bundle synchronized for all 95 modules; whitespace clean.
- Workflow trigger regressions: 4/4. The existing acceptance browser step and
  chat UI configuration now include the picker cases.

The first isolated frontend check needed generated icon assets; a local build
resolved its missing fixture. The first picker fixture used an insecure HTTP
hostname, which lacked `crypto.randomUUID`; the final tests use trusted loopback.
These setup failures were not production device or encryption acceptance.

At the 19:05 UTC preparation checkpoint, this Phase 2 increment had not been
committed, pushed or deployed. The operator subsequently authorized commit,
push and frontend promotion after fresh full CI and actual CodeQL acceptance.
The prior release's security binding certifies only `c9011955`; this candidate
requires its own reviewed source binding. Deployment verification records the
new build, Worker version, served hashes and preserved settings separately. Browser picker/client tests use synthetic
canonical API fixtures and do not prove actual production recipient delivery.
Physical-phone acceptance remains deferred by the operator, and legitimate
device approval is still required for authenticated production messaging.

External Room invites require a separate opaque token/expiry/revocation/scoped
preview design connected to canonical device/MLS admission. Room invite and
participation attribution, Demand resolution linkage, seller liquidity/cohorts,
remaining loops, regional performance, sustained load/chaos and independent
cryptographic acceptance remain open. The full 106-section Definition of Done
is not satisfied by this increment.
