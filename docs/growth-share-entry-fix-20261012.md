# Product Share entry continuity

The visible Share control on product cards previously shared the seller's profile,
while product menu and gallery Share actions went directly to the device share
sheet or clipboard. Internal sharing existed in image quick actions, but ordinary
Share did not expose it.

Product cards and product detail now open the same existing action sheet with
Share to Winga, Copy Deep Link, WhatsApp and the supported external device share
sheet. Device sharing and copying require explicit selection; opening the chooser
does not send a message or create an attributed share. Explicit seller-profile
sharing retains its profile destination.

Share to Winga reuses the canonical encrypted inbox and active, accepted Shopping
Rooms. The existing rich product card, stable message IDs, public-content checks,
recipient selection and transport authorization remain authoritative. Guests see
the product first; selecting internal sharing authenticates and returns to the
same product and internal share dialog. Recipient discovery now supports empty
history through [public people search](growth-recipient-search-20261013.md). This does not create a second recipient,
invite, membership or messaging system.

Product Share controls are excluded from gallery navigation gestures and retain
the existing video share interaction signal. Internal and external chooser labels
are localized in all four supported catalogs.

Verification uses real browser clicks on visible feed/detail Share controls,
explicit external selection, exact guest auth return and existing rich-card/retry
fixtures. Local send stubs establish UI wiring and stable IDs; they do not claim
live participant messages, membership or a completed production growth canary.
