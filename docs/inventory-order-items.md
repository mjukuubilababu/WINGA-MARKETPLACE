# Inventory and Order Items: Backend Foundation

Status: inventory backend foundation plus reservation-first checkout and order-line display.
This is not a completed multi-item/variant checkout rollout.

## Canonical Ownership

- PostgreSQL owns variant stock and order-line snapshots.
- Conversations must reference canonical orders rather than owning stock.
- Existing products remain untracked until an explicit inventory onboarding flow is implemented.
- Historical single-product orders retain a quantity-one, UNTRACKED snapshot. No historical stock is invented.

## Implemented

- Migration: 2026091604_inventory_order_items.
- product_inventory_variants: product, size, color, physical and reserved stock, active state, version.
- order_items: product and variant references, immutable purchase details, quantity and unit price.
- createCommerceOrder accepts internal inventoryItems and quotedTotal context.
- A basket is limited to ten distinct variants, quantities 1-99, one seller, positive canonical prices.
- Current canonical checkout currency is TZS; unsupported inventory currencies are rejected.
- Reservation, order insertion, payment claim and payment insertion share one transaction.
- Cancelled/failed/expired reservations release every line once.
- Delivered orders consume physical stock once.
- Availability is derived from remaining active variant stock after lifecycle updates.
- Legacy checkout cannot silently bypass a product that has tracked variants.
- Existing accepted offers cannot be combined with variant baskets until the offer contract binds variant and quantity.
- Inbox and profile order cards render canonical product/size/color/quantity/unit-price snapshots.

## Reservation-First Checkout

- POST /api/orders/reservations creates the canonical pending order and holds stock before payment.
- Authenticated identity, existing product visibility and canonical prices remain authoritative.
- Buyer-scoped request keys are stored transactionally; mismatched payload replays are rejected.
- CHECKOUT_RESERVATION_SECONDS defaults to 900 and is bounded to 300-3600 seconds.
- POST /api/orders/:id/payment-reference attaches the buyer's provider reference to that same order/payment.
- Attachment does not mark payment paid. Existing verification owns that transition.
- Reference uniqueness, owner checks, expiry checks and one seller notification are transactional.
- Identical retries do not create another order, payment, claim or notification.
- Awaiting-reference orders cannot be marked paid; legacy submitted-payment behavior remains supported.
- The payment modal hides payment details before reservation, supports resuming an unpaid order,
  and hides payment entry after expiry.
- After reference submission the existing 24-hour verification reservation applies.
- Legacy cached clients retain POST /api/orders compatibility during rollout.

## Not Yet Exposed

The public reservation route does not forward inventoryItems yet. There is no inventory-management endpoint or UI yet.
Do not populate production variants manually: checkout cannot select them yet.

Next integration must include:

1. Owner-authorized inventory setup and versioned stock updates, rejecting initialization while legacy reservations exist.
2. Visibility-aware variant reads and authoritative quotes for all selected products.
3. Canonical checkout request validation, error mapping, idempotency, and same-seller dispatch.
4. Size/color/quantity selection and stock management in existing screens.
5. Reserve baskets from the conversation's current seller selection.
6. Goal resolution and analytics for every basket product, not only the legacy primary product.
7. End-to-end guest/authenticated, mobile, ownership, retries and real concurrent PostgreSQL checks.

## Verification

Run npm run test:inventory and npm run test:commerce-outcomes.
The inventory suite uses PGlite PostgreSQL semantics, not mocked SQL success.
It verifies transactional rollback, canonical payment totals, seller ownership,
legacy bypass prevention, expiry, failed payment, completion, sold-out behavior and replay safety.
PGlite tests do not establish production multi-connection contention behavior.
