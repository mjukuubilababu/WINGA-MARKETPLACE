# WINGA Deployment

## HTTPS and reverse proxy

Production stack now uses:

- `Caddy` as reverse proxy
- automatic HTTPS certificates
- same-domain routing

Config file:

```text
Caddyfile
```

Routing behavior:

- `/api/*` and `/uploads/*` go to backend
- frontend files are served directly by Caddy

## Local PostgreSQL mode

Start backend with:

```powershell
backend\start-backend-postgres.bat
```

## Automatic daily backups

Register a Windows scheduled task:

```powershell
powershell -ExecutionPolicy Bypass -File backend\register-daily-postgres-backup.ps1
```

Remove the task later if needed:

```powershell
powershell -ExecutionPolicy Bypass -File backend\unregister-daily-postgres-backup.ps1
```

Manual backup:

```powershell
backend\backup-postgres.bat
```

Manual restore:

```powershell
backend\restore-postgres.bat
```

Verify latest backup age:

```powershell
powershell -ExecutionPolicy Bypass -File backend\verify-latest-postgres-backup.ps1
```

Retention:

- backups older than `BACKUP_RETENTION_DAYS` are deleted automatically
- default retention is `14` days in [backend\postgres-config.bat](C:\Users\user\Desktop\Winga-App\backend\postgres-config.bat)

## Safer secret handling

Do not commit real credentials into source control.

Local machine secret file:

```text
backend\postgres-config.local.bat
```

Tracked template file:

```text
backend\postgres-config.bat
```

Backend `.env` support is also available:

```text
backend\.env
backend\.env.local
```

Template:

```text
backend\.env.example
```

## Docker production stack

1. Copy:

```text
.env.production.example
```

to:

```text
.env
```

2. Put a strong PostgreSQL password into `.env`
3. Put your real domain and email into `.env`

4. Point your domain DNS `A` record to your server IP

5. Start services:

```powershell
docker compose --env-file .env -f docker-compose.production.yml up -d --build
```

This starts:
- PostgreSQL 18
- WINGA backend
- Caddy reverse proxy with HTTPS

Uploads stay on disk in:

```text
backend/uploads
```

## Payment and Delivery Strategy

WINGA should start with a mobile money first approach that matches the Tanzania market.

### Phase 1: Payments

Phase 1 should use a simple manual or semi-manual mobile money workflow instead of a complex payment gateway integration.

Recommended payment methods:

- M-Pesa
- Airtel Money
- Tigo Pesa
- HaloPesa (optional, depending on merchant preference)

Recommended Phase 1 workflow:

1. The buyer clicks `Buy Now`.
2. The app shows the seller payment number and the exact order amount.
3. The buyer completes payment outside the app using mobile money.
4. The buyer submits the transaction ID inside the app.
5. The payment is stored as `Pending`.
6. The seller or admin manually verifies the transaction and confirms payment.
7. The order moves to `Paid`.

This approach is suitable for an MVP because it is fast to operate, familiar to local users, and does not depend on external payment gateway contracts at the beginning.

### Phase 1: Delivery

Phase 1 delivery should stay simple and seller-managed.

Recommended Phase 1 workflow:

1. After payment is confirmed, the seller contacts the buyer directly.
2. The seller arranges delivery or pickup using their own preferred method.
3. The seller updates order progress inside the app.
4. The buyer confirms receipt after delivery is completed.

This keeps operations practical while the platform is still validating demand and transaction volume.

### Future payment upgrades

As the platform grows, the payment layer can be upgraded to:

- direct mobile money API integration
- automated payment verification
- real-time payment callbacks or webhooks
- payment reconciliation and dispute handling
- merchant settlement reporting

### Future delivery upgrades

As order volume grows, delivery can be upgraded to:

- structured shipping addresses
- delivery zones and pricing rules
- courier or dispatcher integrations
- delivery tracking and proof of delivery
- automated delivery notifications

## What Still Needs External Services or Future Work

The platform is now strong enough for an MVP, but the following areas still require external services or future implementation work:

1. Real payment gateway
   This requires a formal integration with a mobile money aggregator or direct telecom APIs for automated collection and verification.

2. Real delivery workflow
   This requires either internal logistics operations or an external courier or delivery partner integration.

3. Centralized monitoring
   This should eventually move to a real monitoring stack such as Sentry, Datadog, CloudWatch, or an equivalent production logging platform.

4. Production authentication hardening
   This should later include stronger session controls, domain-based security policy review, reverse proxy enforcement, and additional operational hardening.

5. Database operations
   This should later include managed PostgreSQL operations, backup verification policy, retention controls, restore drills, and production-grade maintenance procedures.

## What Still Remains Future-Facing (Promotion System)

The promotion system is now functional and commercially useful at the current stage. Sellers can activate promotion options, promoted products can receive priority placement, and the platform can begin generating promotion-based revenue. However, several areas still remain future-facing before the promotion layer reaches full production-scale maturity.

1. Real telecom/gateway confirmation for promotion payments
   The current flow is suitable for an MVP, but the long-term target should be direct payment confirmation through telecom APIs, aggregators, or webhook-driven payment gateways. This would allow promotion payments to be validated automatically, reduce fraud risk, and improve operational reliability.

2. Scheduled promotion billing and reporting
   As the platform grows, promotions should move toward more structured billing support. This includes defined billing cycles, scheduled activation and expiration logic, promotion history, and clearer financial reporting for both platform operations and seller accounts.

3. Richer promotion analytics and seller dashboards
   The next stage should include stronger analytics for promoted listings. At minimum, sellers should be able to see impressions or views, click-through rates, and conversion tracking so they can evaluate the commercial value of each promotion package.

4. Stronger section caps and placement rules
   To preserve listing quality and marketplace fairness, the promotion engine should later introduce stricter section caps, fair rotation rules, clearer priority tiers, and anti-overcrowding controls. This becomes increasingly important as more sellers begin competing for premium placement.

## Recommendation

The recommended path is to start with manual mobile money confirmation and simple seller-managed delivery, then upgrade the payment and delivery stack later as the platform grows and transaction volume justifies deeper integrations.
