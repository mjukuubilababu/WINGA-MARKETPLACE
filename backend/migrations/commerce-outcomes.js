// Milestones are captured in the commerce transaction, never by browser telemetry.
module.exports = Object.freeze({
  id: "2026091402_authoritative_commerce_outcomes",
  statements: Object.freeze([
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS commerce_audience_key TEXT NOT NULL DEFAULT '';`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS commerce_measurement_enabled BOOLEAN NOT NULL DEFAULT FALSE;`,
    `CREATE TABLE commerce_order_outcomes (
       order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
       outcome_type TEXT NOT NULL CHECK (outcome_type IN ('created', 'paid', 'delivered', 'cancelled', 'refunded')),
       source_event_id TEXT NOT NULL UNIQUE,
       product_id TEXT NOT NULL,
       seller_id TEXT NOT NULL,
       audience_key TEXT NOT NULL,
       eligibility_id TEXT,
       experiment_key TEXT NOT NULL DEFAULT '',
       experiment_arm TEXT CHECK (experiment_arm IN ('control', 'treatment')),
       assigned_at TIMESTAMPTZ,
       observation_ends_at TIMESTAMPTZ,
       occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
       source TEXT NOT NULL,
       order_status TEXT NOT NULL,
       payment_status TEXT NOT NULL,
       PRIMARY KEY (order_id, outcome_type)
     );`,
    `CREATE INDEX idx_commerce_outcomes_seller_recent ON commerce_order_outcomes (seller_id, occurred_at DESC);`,
    `CREATE INDEX idx_commerce_outcomes_eligibility ON commerce_order_outcomes (eligibility_id, outcome_type, occurred_at)
       WHERE eligibility_id IS NOT NULL;`,
    `CREATE INDEX idx_rediscovery_order_measurement ON rediscovery_eligibility
       (audience_type, audience_key, product_id, assigned_at DESC)
       WHERE experiment_key = 'commerce_rediscovery_v1';`,
    `CREATE FUNCTION record_commerce_order_outcome(target_order TEXT, milestone TEXT, event_source TEXT, event_id TEXT)
     RETURNS VOID LANGUAGE plpgsql AS $$
     BEGIN
       INSERT INTO commerce_order_outcomes (
         order_id, outcome_type, source_event_id, product_id, seller_id, audience_key,
         eligibility_id, experiment_key, experiment_arm, assigned_at, observation_ends_at,
         source, order_status, payment_status
       )
       SELECT o.id, milestone, event_id, o.product_id, o.seller_username, o.commerce_audience_key,
              CASE WHEN milestone = 'created' THEN re.eligibility_id ELSE initial.eligibility_id END,
              COALESCE(CASE WHEN milestone = 'created' THEN re.experiment_key ELSE initial.experiment_key END, ''),
              CASE WHEN milestone = 'created' THEN re.experiment_arm ELSE initial.experiment_arm END,
              CASE WHEN milestone = 'created' THEN re.assigned_at ELSE initial.assigned_at END,
              CASE WHEN milestone = 'created' THEN re.assigned_at + INTERVAL '7 days' ELSE initial.observation_ends_at END,
              event_source, o.status, o.payment_status
       FROM orders o
       LEFT JOIN commerce_order_outcomes initial ON initial.order_id = o.id AND initial.outcome_type = 'created'
       LEFT JOIN LATERAL (
         SELECT eligibility.* FROM rediscovery_eligibility eligibility
         LEFT JOIN supply_responses response ON response.response_id = eligibility.supply_response_id
         WHERE milestone = 'created' AND eligibility.product_id = o.product_id
           AND eligibility.audience_type = 'user' AND eligibility.audience_key = o.commerce_audience_key
           AND o.commerce_audience_key <> '' AND response.seller_id = o.seller_username
           AND eligibility.experiment_key = 'commerce_rediscovery_v1'
           AND eligibility.assigned_at >= (SELECT applied_at FROM schema_migrations
             WHERE migration_id = '2026091402_authoritative_commerce_outcomes')
           AND eligibility.assigned_at <= o.created_at AND eligibility.eligible_at <= o.created_at
           AND eligibility.expires_at > o.created_at
           AND eligibility.assigned_at + INTERVAL '7 days' > o.created_at
         ORDER BY eligibility.assigned_at DESC, eligibility.eligibility_id DESC LIMIT 1
       ) re ON TRUE
       WHERE o.id = target_order AND o.commerce_measurement_enabled
         AND (milestone = 'created' OR initial.order_id IS NOT NULL)
       ON CONFLICT (order_id, outcome_type) DO NOTHING;
     END $$;`,
    `CREATE FUNCTION capture_commerce_order_outcomes() RETURNS TRIGGER LANGUAGE plpgsql AS $$
     BEGIN
       IF NOT NEW.commerce_measurement_enabled THEN RETURN NEW; END IF;
       IF TG_OP = 'UPDATE' THEN
         IF NEW.status IS NOT DISTINCT FROM OLD.status AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
           RETURN NEW;
         END IF;
       END IF;
       IF TG_OP = 'INSERT' THEN
         PERFORM record_commerce_order_outcome(NEW.id, 'created', 'order_insert', 'order:' || NEW.id || ':created');
       END IF;
       IF NEW.payment_status = 'paid' THEN
         PERFORM record_commerce_order_outcome(NEW.id, 'paid', 'order_payment_status', 'order:' || NEW.id || ':paid');
       END IF;
       IF NEW.status = 'delivered' THEN
         PERFORM record_commerce_order_outcome(NEW.id, 'delivered', 'order_status', 'order:' || NEW.id || ':delivered');
       END IF;
       IF NEW.status = 'cancelled' THEN
         PERFORM record_commerce_order_outcome(NEW.id, 'cancelled', 'order_status', 'order:' || NEW.id || ':cancelled');
       END IF;
       IF NEW.payment_status = 'refunded' THEN
         PERFORM record_commerce_order_outcome(NEW.id, 'refunded', 'order_payment_status', 'order:' || NEW.id || ':refunded');
       END IF;
       RETURN NEW;
     END $$;`,
    `CREATE TRIGGER trg_commerce_order_outcomes AFTER INSERT OR UPDATE OF status, payment_status ON orders
       FOR EACH ROW EXECUTE FUNCTION capture_commerce_order_outcomes();`,
    // Late-payment refunds do not always transition an order to refunded.
    `CREATE FUNCTION capture_commerce_refund_outcome() RETURNS TRIGGER LANGUAGE plpgsql AS $$
     BEGIN
       IF NEW.status = 'confirmed' THEN
         PERFORM record_commerce_order_outcome(NEW.order_id, 'refunded', 'provider_refund_confirmation', 'refund:' || NEW.id);
       END IF;
       RETURN NEW;
     END $$;`,
    `CREATE TRIGGER trg_commerce_refund_outcome AFTER INSERT OR UPDATE OF status ON payment_refund_outbox
       FOR EACH ROW EXECUTE FUNCTION capture_commerce_refund_outcome();`
  ])
});
