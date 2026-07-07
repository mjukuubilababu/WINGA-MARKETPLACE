const { Pool } = require("pg");

function stringifyJson(value, fallback = []) {
  return JSON.stringify(value ?? fallback);
}

function parseJson(value, fallback) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  return value;
}

function toISOString(value) {
  if (!value) {
    return "";
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function parseProductCursor(cursor) {
  const rawCursor = String(cursor || "").trim();
  if (!rawCursor) {
    return null;
  }
  const separatorIndex = rawCursor.indexOf("|");
  if (separatorIndex <= 0 || separatorIndex >= rawCursor.length - 1) {
    return null;
  }
  const createdAt = rawCursor.slice(0, separatorIndex).trim();
  const id = rawCursor.slice(separatorIndex + 1).trim();
  const parsedDate = new Date(createdAt);
  if (!createdAt || !id || Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return {
    createdAt: parsedDate.toISOString(),
    id
  };
}

function normalizeProductRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const totalDemand = Number(row.demandTotalDemand || 0);
  const waitingUsers = Number(row.demandWaitingUsers || 0);
  const restockInterest = Number(row.demandRestockInterest || 0);
  const demandScore = Number(row.demandScore || 0);
  const hasDemandSummary = totalDemand > 0 || waitingUsers > 0 || restockInterest > 0 || demandScore > 0;

  return {
    id: row.id || "",
    name: row.name || "",
    price: row.price == null ? null : Number(row.price),
    shop: row.shop || "",
    whatsapp: row.whatsapp || "",
    image: row.image || "",
    images: parseJson(row.images, []),
    uploadedBy: row.uploadedBy || "",
    category: row.category || "",
    status: row.status || "",
    availability: row.availability || "available",
    moderationNote: row.moderationNote || "",
    moderatedAt: toISOString(row.moderatedAt),
    moderatedBy: row.moderatedBy || "",
    originalProductId: row.originalProductId || "",
    originalSellerId: row.originalSellerId || "",
    resellerId: row.resellerId || "",
    resalePrice: row.resalePrice == null ? null : Number(row.resalePrice),
    resoldStatus: row.resoldStatus || "original",
    createdAt: toISOString(row.createdAt),
    updatedAt: toISOString(row.updatedAt),
    likes: Number(row.likes || 0),
    views: Number(row.views || 0),
    viewedBy: parseJson(row.viewedBy, []),
    demandSummary: hasDemandSummary
      ? {
        totalDemand,
        waitingUsers,
        restockInterest,
        demandScore,
        actionCounts: parseJson(row.demandActionCounts, {}),
        topColors: parseJson(row.demandTopColors, []),
        topSizes: parseJson(row.demandTopSizes, []),
        lastDemandAt: toISOString(row.demandLastDemandAt)
      }
      : null
  };
}

function createPostgresStore({ databaseUrl, ssl = false, queryClient = null }) {
  const pool = queryClient || new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false
  });

  async function query(text, params = []) {
    return pool.query(text, params);
  }

  function buildProductVisibilityClause({ viewerUsername = "", isStaffViewer = false } = {}) {
    const clauses = [];
    const params = [];
    const safeViewerUsername = String(viewerUsername || "").trim().slice(0, 40);

    if (!isStaffViewer) {
      if (safeViewerUsername) {
        params.push(safeViewerUsername);
        clauses.push(`(status = 'approved' OR uploaded_by = $${params.length})`);
      } else {
        clauses.push("status = 'approved'");
      }
    }

    return {
      clauses,
      params,
      safeViewerUsername
    };
  }

  async function ensureSchema() {
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        value TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        full_name TEXT NOT NULL DEFAULT '',
        password TEXT NOT NULL,
        phone_number TEXT UNIQUE NOT NULL,
        national_id TEXT UNIQUE,
        primary_category TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        moderation_reason TEXT NOT NULL DEFAULT '',
        moderation_note TEXT NOT NULL DEFAULT '',
        verified_seller BOOLEAN NOT NULL DEFAULT FALSE,
        profile_image TEXT NOT NULL DEFAULT '',
        identity_document_type TEXT NOT NULL DEFAULT '',
        identity_document_number TEXT NOT NULL DEFAULT '',
        identity_document_image TEXT NOT NULL DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT '',
        verification_submitted_at TIMESTAMPTZ NULL,
        moderated_at TIMESTAMPTZ NULL,
        moderated_by TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price NUMERIC(14, 2),
        shop TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        image TEXT NOT NULL,
        images JSONB NOT NULL DEFAULT '[]'::jsonb,
        uploaded_by TEXT NOT NULL,
        category TEXT NOT NULL,
        status TEXT NOT NULL,
        availability TEXT NOT NULL DEFAULT 'available',
        moderation_note TEXT NOT NULL DEFAULT '',
        moderated_at TIMESTAMPTZ NULL,
        moderated_by TEXT NOT NULL DEFAULT '',
        original_product_id TEXT NOT NULL DEFAULT '',
        original_seller_id TEXT NOT NULL DEFAULT '',
        reseller_id TEXT NOT NULL DEFAULT '',
        resale_price NUMERIC(14, 2),
        resold_status TEXT NOT NULL DEFAULT 'original',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        likes INTEGER NOT NULL DEFAULT 0,
        views INTEGER NOT NULL DEFAULT 0,
        viewed_by JSONB NOT NULL DEFAULT '[]'::jsonb
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        primary_category TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'seller',
        status TEXT NOT NULL DEFAULT 'active',
        profile_image TEXT NOT NULL DEFAULT '',
        verification_status TEXT NOT NULL DEFAULT '',
        expires_at BIGINT NOT NULL
      );
    `);

    await query(`
      ALTER TABLE products
      ALTER COLUMN price DROP NOT NULL;
    `);
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS original_product_id TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS original_seller_id TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS reseller_id TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS resale_price NUMERIC(14, 2);
    `);
    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS resold_status TEXT NOT NULL DEFAULT 'original';
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        product_image TEXT NOT NULL DEFAULT '',
        price NUMERIC(14, 2) NOT NULL,
        buyer_username TEXT NOT NULL,
        seller_username TEXT NOT NULL,
        shop TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT NOT NULL DEFAULT 'mobile_money',
        payment_phone_number TEXT NOT NULL DEFAULT '',
        transaction_id TEXT NOT NULL DEFAULT '',
        payment_submitted_at TIMESTAMPTZ NULL,
        payment_confirmed_at TIMESTAMPTZ NULL,
        payment_confirmed_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

      await query(`
        CREATE TABLE IF NOT EXISTS payments (
          id TEXT PRIMARY KEY,
          order_id TEXT NOT NULL,
          buyer_username TEXT NOT NULL,
        amount_paid NUMERIC(14, 2) NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'mobile_money',
        transaction_reference TEXT NOT NULL DEFAULT '',
        receipt_number TEXT NOT NULL DEFAULT '',
        payment_status TEXT NOT NULL DEFAULT 'pending',
        payer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
        raw_gateway_response JSONB NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          sender_id TEXT NOT NULL,
          receiver_id TEXT NOT NULL,
          conversation_id TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          message_type TEXT NOT NULL DEFAULT 'text',
          product_id TEXT NOT NULL DEFAULT '',
          product_name TEXT NOT NULL DEFAULT '',
          product_items JSONB NOT NULL DEFAULT '[]'::jsonb,
          reply_to_message_id TEXT NOT NULL DEFAULT '',
          timestamp TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          delivered_at TIMESTAMPTZ NULL,
          read_at TIMESTAMPTZ NULL,
          is_delivered BOOLEAN NOT NULL DEFAULT TRUE,
          is_read BOOLEAN NOT NULL DEFAULT FALSE
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'message',
          message_id TEXT NOT NULL DEFAULT '',
          conversation_id TEXT NOT NULL DEFAULT '',
          title TEXT NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          read_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL
        );
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS promotions (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL,
          seller_username TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
          payment_method TEXT NOT NULL DEFAULT 'mobile_money',
          transaction_reference TEXT NOT NULL DEFAULT '',
          payment_status TEXT NOT NULL DEFAULT 'pending',
          start_date TIMESTAMPTZ NOT NULL,
          end_date TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          approved_at TIMESTAMPTZ NULL,
          baseline_views INTEGER NOT NULL DEFAULT 0,
          baseline_likes INTEGER NOT NULL DEFAULT 0,
          disabled_at TIMESTAMPTZ NULL,
          disabled_by TEXT NOT NULL DEFAULT ''
        );
      `);

    await query(`
      ALTER TABLE promotions
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE promotions
      ADD COLUMN IF NOT EXISTS baseline_views INTEGER NOT NULL DEFAULT 0;
    `);
    await query(`
      ALTER TABLE promotions
      ADD COLUMN IF NOT EXISTS baseline_likes INTEGER NOT NULL DEFAULT 0;
    `);

      await query(`
        CREATE TABLE IF NOT EXISTS reviews (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          seller_id TEXT NOT NULL,
          rating INTEGER NOT NULL,
          comment TEXT NOT NULL,
          verified_buyer BOOLEAN NOT NULL DEFAULT FALSE,
          date TIMESTAMPTZ NOT NULL
        );
      `);

    await query(`
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_user_id TEXT NOT NULL DEFAULT '',
        target_product_id TEXT NOT NULL DEFAULT '',
        reporter_user_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        review_note TEXT NOT NULL DEFAULT '',
        reviewed_by TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS moderation_actions (
        id TEXT PRIMARY KEY,
        admin_username TEXT NOT NULL,
        action_type TEXT NOT NULL,
        target_user_id TEXT NOT NULL DEFAULT '',
        target_product_id TEXT NOT NULL DEFAULT '',
        reason TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        time TIMESTAMPTZ NOT NULL,
        event TEXT NOT NULL,
        entry JSONB NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS intelligence_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        source_event TEXT NOT NULL DEFAULT '',
        happened_at TIMESTAMPTZ NOT NULL,
        product_id TEXT NOT NULL DEFAULT '',
        seller_id TEXT NOT NULL DEFAULT '',
        buyer_id TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        feed_context TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        device_type TEXT NOT NULL DEFAULT '',
        app_version TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT '',
        alert_severity TEXT NOT NULL DEFAULT '',
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        platform_version TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS intelligence_event_queue (
        queue_id BIGSERIAL PRIMARY KEY,
        event_id TEXT NOT NULL UNIQUE,
        event_payload JSONB NOT NULL,
        score_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        locked_at TIMESTAMPTZ,
        locked_by TEXT NOT NULL DEFAULT '',
        processed_at TIMESTAMPTZ,
        last_error TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS product_intelligence_scores (
        product_id TEXT PRIMARY KEY,
        score NUMERIC(12, 2) NOT NULL DEFAULT 0,
        signals JSONB NOT NULL DEFAULT '{}'::jsonb,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS seller_intelligence_scores (
        seller_id TEXT PRIMARY KEY,
        score NUMERIC(12, 2) NOT NULL DEFAULT 0,
        signals JSONB NOT NULL DEFAULT '{}'::jsonb,
        first_seen_at TIMESTAMPTZ NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS demand_events (
        demand_id TEXT PRIMARY KEY,
        dedupe_key TEXT NOT NULL UNIQUE,
        product_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '',
        size TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        demand_score NUMERIC(12, 2) NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS product_demand_summaries (
        product_id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        total_demand INTEGER NOT NULL DEFAULT 0,
        waiting_users INTEGER NOT NULL DEFAULT 0,
        restock_interest INTEGER NOT NULL DEFAULT 0,
        demand_score NUMERIC(12, 2) NOT NULL DEFAULT 0,
        action_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
        top_colors JSONB NOT NULL DEFAULT '[]'::jsonb,
        top_sizes JSONB NOT NULL DEFAULT '[]'::jsonb,
        first_demand_at TIMESTAMPTZ,
        last_demand_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS search_demand_events (
        event_id TEXT PRIMARY KEY,
        dedupe_key TEXT NOT NULL UNIQUE,
        happened_at TIMESTAMPTZ NOT NULL,
        query TEXT NOT NULL DEFAULT '',
        query_key TEXT NOT NULL,
        detected_category TEXT NOT NULL DEFAULT '',
        detected_product_type TEXT NOT NULL DEFAULT '',
        detected_color TEXT NOT NULL DEFAULT '',
        detected_brand TEXT NOT NULL DEFAULT '',
        detected_style TEXT NOT NULL DEFAULT '',
        price_range TEXT NOT NULL DEFAULT '',
        country TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        location TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'text',
        result_count INTEGER NOT NULL DEFAULT 0,
        clicked_product_id TEXT NOT NULL DEFAULT '',
        no_click BOOLEAN NOT NULL DEFAULT FALSE,
        zero_result BOOLEAN NOT NULL DEFAULT FALSE,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS intelligence_daily_snapshots (
        snapshot_date DATE NOT NULL,
        snapshot_type TEXT NOT NULL,
        snapshot_key TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        score NUMERIC(12, 2) NOT NULL DEFAULT 0,
        metric JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (snapshot_date, snapshot_type, snapshot_key)
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_events_type_time
      ON intelligence_events (event_type, happened_at DESC);
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_event_queue_status_available
      ON intelligence_event_queue (status, available_at, queue_id);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_events_product_time
      ON intelligence_events (product_id, happened_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_events_seller_time
      ON intelligence_events (seller_id, happened_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_product_intelligence_scores_score
      ON product_intelligence_scores (score DESC, last_seen_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_seller_intelligence_scores_score
      ON seller_intelligence_scores (score DESC, last_seen_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_demand_events_product_time
      ON demand_events (product_id, created_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_demand_events_seller_time
      ON demand_events (seller_id, created_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_product_demand_summaries_seller_score
      ON product_demand_summaries (seller_id, demand_score DESC, last_demand_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_search_demand_events_query_time
      ON search_demand_events (query_key, happened_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_search_demand_events_category_time
      ON search_demand_events (detected_category, happened_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_daily_snapshots_type_date_score
      ON intelligence_daily_snapshots (snapshot_type, snapshot_date DESC, score DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_daily_snapshots_date_updated
      ON intelligence_daily_snapshots (snapshot_date DESC, updated_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_intelligence_daily_snapshots_updated
      ON intelligence_daily_snapshots (updated_at DESC);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_search_demand_events_region_time
      ON search_demand_events (location, happened_at DESC);
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        settings JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by TEXT NOT NULL DEFAULT ''
      );
    `);

    await query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'available';
    `);

    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending';
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'mobile_money';
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_phone_number TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS transaction_id TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ALTER COLUMN national_id DROP NOT NULL;
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS moderation_reason TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS moderation_note TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verified_seller BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS moderated_by TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS profile_image TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS identity_document_type TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS identity_document_number TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS identity_document_image TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
    `);
    await query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS profile_image TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE sessions
      ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payer_details JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    await query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS raw_gateway_response JSONB NULL;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT '';
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS product_items JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    await query(`
      ALTER TABLE messages
      ADD COLUMN IF NOT EXISTS reply_to_message_id TEXT NOT NULL DEFAULT '';
    `);
  }

  async function isEmpty() {
    const result = await query("SELECT COUNT(*)::int AS count FROM users");
    return Number(result.rows[0]?.count || 0) === 0;
  }

  async function writeStore(store) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM sessions");
      await client.query("DELETE FROM moderation_actions");
        await client.query("DELETE FROM app_settings");
        await client.query("DELETE FROM reports");
        await client.query("DELETE FROM reviews");
        await client.query("DELETE FROM promotions");
        await client.query("DELETE FROM notifications");
        await client.query("DELETE FROM messages");
        await client.query("DELETE FROM payments");
      await client.query("DELETE FROM orders");
      await client.query("DELETE FROM products");
      await client.query("DELETE FROM users");
      await client.query("DELETE FROM categories");

        for (const category of store.categories || []) {
        await client.query(
          `INSERT INTO categories (value, label, created_at) VALUES ($1, $2, $3)`,
          [
            category.value,
            category.label,
            category.createdAt || new Date().toISOString()
          ]
        );
      }

      for (const user of store.users || []) {
        await client.query(
          `INSERT INTO users (
            username, full_name, password, phone_number, national_id, primary_category, role, status,
            moderation_reason, moderation_note, verified_seller, profile_image, identity_document_type,
            identity_document_number, identity_document_image, verification_status, verification_submitted_at, moderated_at, moderated_by, updated_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
          [
            user.username,
            user.fullName || user.username,
            user.password,
            user.phoneNumber,
            user.nationalId || null,
            user.primaryCategory || "",
            user.role || "seller",
            user.status || "active",
            user.moderationReason || "",
            user.moderationNote || "",
            Boolean(user.verifiedSeller),
            user.profileImage || "",
            user.identityDocumentType || "",
            user.identityDocumentNumber || user.nationalId || "",
            user.identityDocumentImage || "",
            user.verificationStatus || "",
            user.verificationSubmittedAt || null,
            user.moderatedAt || null,
            user.moderatedBy || "",
            user.updatedAt || user.createdAt || new Date().toISOString(),
            user.createdAt || new Date().toISOString()
          ]
        );
      }

      for (const product of store.products || []) {
        await client.query(
          `INSERT INTO products (
            id, name, price, shop, whatsapp, image, images, uploaded_by, category,
            status, availability, moderation_note, moderated_at, moderated_by, original_product_id, original_seller_id,
            reseller_id, resale_price, resold_status, created_at, updated_at,
            likes, views, viewed_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9,
            $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21,
            $22, $23, $24::jsonb
          )`,
          [
            product.id,
            product.name,
            product.price,
            product.shop,
            product.whatsapp,
            product.image,
            stringifyJson(product.images, []),
            product.uploadedBy,
            product.category,
            product.status || "approved",
            product.availability || "available",
            product.moderationNote || "",
            product.moderatedAt || null,
            product.moderatedBy || "",
            product.originalProductId || "",
            product.originalSellerId || "",
            product.resellerId || "",
            product.resalePrice ?? null,
            product.resoldStatus || "original",
            product.createdAt || new Date().toISOString(),
            product.updatedAt || new Date().toISOString(),
            Number(product.likes || 0),
            Number(product.views || 0),
            stringifyJson(product.viewedBy, [])
          ]
        );
      }

      for (const session of store.sessions || []) {
        await client.query(
          `INSERT INTO sessions (token, username, full_name, primary_category, role, status, profile_image, verification_status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            session.token,
            session.username,
            session.fullName || session.username,
            session.primaryCategory || "",
            session.role || "seller",
            session.status || "active",
            session.profileImage || "",
            session.verificationStatus || "",
            session.expiresAt
          ]
        );
      }

      for (const order of store.orders || []) {
        await client.query(
          `INSERT INTO orders (
            id, product_id, product_name, product_image, price, buyer_username, seller_username, shop, status,
            payment_status, payment_method, payment_phone_number, transaction_id, payment_submitted_at, payment_confirmed_at, payment_confirmed_by, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17
          )`,
          [
            order.id,
            order.productId,
            order.productName,
            order.productImage || "",
            order.price,
            order.buyerUsername,
            order.sellerUsername,
            order.shop || "",
            order.status || "placed",
            order.paymentStatus || "pending",
            order.paymentMethod || "mobile_money",
            order.paymentPhoneNumber || "",
            order.transactionId || "",
            order.paymentSubmittedAt || null,
            order.paymentConfirmedAt || null,
            order.paymentConfirmedBy || "",
            order.createdAt || new Date().toISOString()
          ]
        );
      }

      for (const payment of store.payments || []) {
        await client.query(
          `INSERT INTO payments (
            id, order_id, buyer_username, amount_paid, payment_method, transaction_reference,
            receipt_number, payment_status, payer_details, raw_gateway_response, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9::jsonb, $10::jsonb, $11, $12
          )`,
          [
            payment.id,
            payment.orderId,
            payment.buyerUsername,
            Number(payment.amountPaid || 0),
            payment.paymentMethod || "mobile_money",
            payment.transactionReference || "",
            payment.receiptNumber || "",
            payment.paymentStatus || "pending",
            stringifyJson(payment.payerDetails, {}),
            payment.rawGatewayResponse == null ? null : stringifyJson(payment.rawGatewayResponse, null),
            payment.createdAt || new Date().toISOString(),
            payment.updatedAt || payment.createdAt || new Date().toISOString()
          ]
        );
      }

        for (const report of store.reports || []) {
          await client.query(
            `INSERT INTO reports (
            id, target_type, target_user_id, target_product_id, reporter_user_id, reason, description,
            status, review_note, reviewed_by, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12
          )`,
          [
            report.id,
            report.targetType,
            report.targetUserId || "",
            report.targetProductId || "",
            report.reporterUserId,
            report.reason,
            report.description || "",
            report.status || "open",
            report.reviewNote || "",
            report.reviewedBy || "",
            report.createdAt || new Date().toISOString(),
            report.updatedAt || report.createdAt || new Date().toISOString()
          ]
          );
        }

      await client.query(
        `INSERT INTO app_settings (id, settings, updated_at, updated_by)
         VALUES (1, $1::jsonb, $2, $3)`,
        [
          stringifyJson(store.settings || {}, {}),
          (store.settings && store.settings.updatedAt) || new Date().toISOString(),
          (store.settings && store.settings.updatedBy) || ""
        ]
      );

        for (const message of store.messages || []) {
          await client.query(
            `INSERT INTO messages (
              id, sender_id, receiver_id, conversation_id, message, message_type, product_id, product_name,
              product_items, reply_to_message_id, timestamp, created_at, updated_at, delivered_at, read_at, is_delivered, is_read
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8,
              $9, $10, $11, $12, $13, $14, $15, $16, $17
            )`,
            [
              message.id,
              message.senderId,
              message.receiverId,
              message.conversationId || "",
              message.message,
              message.messageType || "text",
              message.productId || "",
              message.productName || "",
              JSON.stringify(Array.isArray(message.productItems) ? message.productItems : []),
              message.replyToMessageId || "",
              message.timestamp || new Date().toISOString(),
              message.createdAt || message.timestamp || new Date().toISOString(),
              message.updatedAt || message.createdAt || message.timestamp || new Date().toISOString(),
              message.deliveredAt || message.createdAt || message.timestamp || new Date().toISOString(),
              message.readAt || null,
              typeof message.isDelivered === "boolean" ? message.isDelivered : true,
              Boolean(message.isRead)
            ]
          );
        }

        for (const notification of store.notifications || []) {
          await client.query(
            `INSERT INTO notifications (
              id, user_id, type, message_id, conversation_id, title, body, is_read, read_at, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )`,
            [
              notification.id,
              notification.userId,
              notification.type || "message",
              notification.messageId || "",
              notification.conversationId || "",
              notification.title || "",
              notification.body || "",
              Boolean(notification.isRead),
              notification.readAt || null,
              notification.createdAt || new Date().toISOString()
            ]
          );
        }

        for (const promotion of store.promotions || []) {
          await client.query(
            `INSERT INTO promotions (
              id, product_id, seller_username, type, status, amount_paid, payment_method,
              transaction_reference, payment_status, start_date, end_date, created_at,
              updated_at, approved_at, baseline_views, baseline_likes, disabled_at, disabled_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, $15, $16, $17, $18
            )`,
            [
              promotion.id,
              promotion.productId,
              promotion.sellerUsername,
              promotion.type,
              promotion.status || "pending",
              Number(promotion.amountPaid || 0),
              promotion.paymentMethod || "mobile_money",
              promotion.transactionReference || "",
              promotion.paymentStatus || "pending",
              promotion.startDate || new Date().toISOString(),
              promotion.endDate || new Date().toISOString(),
              promotion.createdAt || new Date().toISOString(),
              promotion.updatedAt || promotion.createdAt || new Date().toISOString(),
              promotion.approvedAt || null,
              Number(promotion.baselineViews || 0),
              Number(promotion.baselineLikes || 0),
              promotion.disabledAt || null,
              promotion.disabledBy || ""
            ]
          );
        }

        for (const review of store.reviews || []) {
          await client.query(
            `INSERT INTO reviews (
              id, user_id, product_id, seller_id, rating, comment, verified_buyer, date
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8
            )`,
            [
              review.id,
              review.userId,
              review.productId,
              review.sellerId || "",
              Number(review.rating || 0),
              review.comment,
              Boolean(review.verifiedBuyer),
              review.date || new Date().toISOString()
            ]
          );
        }

        for (const action of store.moderationActions || []) {
        await client.query(
          `INSERT INTO moderation_actions (
            id, admin_username, action_type, target_user_id, target_product_id, reason, note, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
          )`,
          [
            action.id,
            action.adminUsername,
            action.actionType,
            action.targetUserId || "",
            action.targetProductId || "",
            action.reason || "",
            action.note || "",
            action.createdAt || new Date().toISOString()
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function readStore() {
      const [categoriesResult, usersResult, productsResult, sessionsResult, ordersResult, paymentsResult, messagesResult, notificationsResult, promotionsResult, reviewsResult, reportsResult, moderationActionsResult, settingsResult] = await Promise.all([
      query(`
        SELECT
          value,
          label,
          created_at AS "createdAt"
        FROM categories
        ORDER BY created_at ASC
      `),
      query(`
        SELECT
          username,
          full_name AS "fullName",
          password,
          phone_number AS "phoneNumber",
          national_id AS "nationalId",
          primary_category AS "primaryCategory",
          role,
          status,
          moderation_reason AS "moderationReason",
          moderation_note AS "moderationNote",
          verified_seller AS "verifiedSeller",
          profile_image AS "profileImage",
          identity_document_type AS "identityDocumentType",
          identity_document_number AS "identityDocumentNumber",
          identity_document_image AS "identityDocumentImage",
          verification_status AS "verificationStatus",
          verification_submitted_at AS "verificationSubmittedAt",
          moderated_at AS "moderatedAt",
          moderated_by AS "moderatedBy",
          updated_at AS "updatedAt",
          created_at AS "createdAt"
        FROM users
        ORDER BY created_at ASC
      `),
      query(`
        SELECT
          id,
          name,
          price::float8 AS price,
          shop,
          whatsapp,
          image,
          images,
          uploaded_by AS "uploadedBy",
          category,
          status,
          availability,
          moderation_note AS "moderationNote",
          moderated_at AS "moderatedAt",
          moderated_by AS "moderatedBy",
          original_product_id AS "originalProductId",
          original_seller_id AS "originalSellerId",
          reseller_id AS "resellerId",
          resale_price::float8 AS "resalePrice",
          resold_status AS "resoldStatus",
          created_at AS "createdAt",
          updated_at AS "updatedAt",
          likes,
          views,
          viewed_by AS "viewedBy"
        FROM products
        ORDER BY created_at DESC, id DESC
      `),
      query(`
        SELECT
          token,
          username,
          full_name AS "fullName",
          primary_category AS "primaryCategory",
          role,
          status,
          profile_image AS "profileImage",
          verification_status AS "verificationStatus",
          expires_at AS "expiresAt"
        FROM sessions
        ORDER BY expires_at DESC
      `),
      query(`
        SELECT
          id,
          product_id AS "productId",
          product_name AS "productName",
          product_image AS "productImage",
          price::float8 AS price,
          buyer_username AS "buyerUsername",
          seller_username AS "sellerUsername",
          shop,
          status,
          payment_status AS "paymentStatus",
          payment_method AS "paymentMethod",
          payment_phone_number AS "paymentPhoneNumber",
          transaction_id AS "transactionId",
          payment_submitted_at AS "paymentSubmittedAt",
          payment_confirmed_at AS "paymentConfirmedAt",
          payment_confirmed_by AS "paymentConfirmedBy",
          created_at AS "createdAt"
        FROM orders
        ORDER BY created_at DESC
      `),
        query(`
          SELECT
            id,
            order_id AS "orderId",
          buyer_username AS "buyerUsername",
          amount_paid::float8 AS "amountPaid",
          payment_method AS "paymentMethod",
          transaction_reference AS "transactionReference",
          receipt_number AS "receiptNumber",
          payment_status AS "paymentStatus",
          payer_details AS "payerDetails",
          raw_gateway_response AS "rawGatewayResponse",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
          FROM payments
          ORDER BY created_at DESC
        `),
        query(`
          SELECT
            id,
            sender_id AS "senderId",
            receiver_id AS "receiverId",
            conversation_id AS "conversationId",
            message,
            message_type AS "messageType",
            product_id AS "productId",
            product_name AS "productName",
            product_items AS "productItems",
            reply_to_message_id AS "replyToMessageId",
            timestamp,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            delivered_at AS "deliveredAt",
            read_at AS "readAt",
            is_delivered AS "isDelivered",
            is_read AS "isRead"
          FROM messages
          ORDER BY timestamp ASC
        `),
        query(`
          SELECT
            id,
            user_id AS "userId",
            type,
            message_id AS "messageId",
            conversation_id AS "conversationId",
            title,
            body,
            is_read AS "isRead",
            read_at AS "readAt",
            created_at AS "createdAt"
          FROM notifications
          ORDER BY created_at DESC
        `),
        query(`
          SELECT
            id,
            product_id AS "productId",
            seller_username AS "sellerUsername",
            type,
            status,
            amount_paid::float8 AS "amountPaid",
            payment_method AS "paymentMethod",
            transaction_reference AS "transactionReference",
            payment_status AS "paymentStatus",
            start_date AS "startDate",
            end_date AS "endDate",
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            approved_at AS "approvedAt",
            baseline_views AS "baselineViews",
            baseline_likes AS "baselineLikes",
            disabled_at AS "disabledAt",
            disabled_by AS "disabledBy"
          FROM promotions
          ORDER BY created_at DESC
        `),
        query(`
          SELECT
            id,
            user_id AS "userId",
            product_id AS "productId",
            seller_id AS "sellerId",
            rating,
            comment,
            verified_buyer AS "verifiedBuyer",
            date
          FROM reviews
          ORDER BY date DESC
        `),
        query(`
          SELECT
            id,
          target_type AS "targetType",
          target_user_id AS "targetUserId",
          target_product_id AS "targetProductId",
          reporter_user_id AS "reporterUserId",
          reason,
          description,
          status,
          review_note AS "reviewNote",
          reviewed_by AS "reviewedBy",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM reports
        ORDER BY created_at DESC
      `),
      query(`
        SELECT
          id,
          admin_username AS "adminUsername",
          action_type AS "actionType",
          target_user_id AS "targetUserId",
          target_product_id AS "targetProductId",
          reason,
          note,
          created_at AS "createdAt"
        FROM moderation_actions
        ORDER BY created_at DESC
      `),
      query(`
        SELECT
          settings,
          updated_at AS "updatedAt",
          updated_by AS "updatedBy"
        FROM app_settings
        ORDER BY id ASC
        LIMIT 1
      `)
    ]);

    return {
      categories: categoriesResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : ""
      })),
      users: usersResult.rows.map((row) => ({
        ...row,
        moderatedAt: row.moderatedAt ? new Date(row.moderatedAt).toISOString() : "",
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : ""
      })),
      products: productsResult.rows.map((row) => ({
        ...row,
        images: parseJson(row.images, []),
        viewedBy: parseJson(row.viewedBy, []),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
        moderatedAt: row.moderatedAt ? new Date(row.moderatedAt).toISOString() : ""
      })),
      sessions: sessionsResult.rows,
      orders: ordersResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : ""
      })),
        payments: paymentsResult.rows.map((row) => ({
          ...row,
          payerDetails: parseJson(row.payerDetails, {}),
          rawGatewayResponse: parseJson(row.rawGatewayResponse, null),
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ""
        })),
        messages: messagesResult.rows.map((row) => ({
          ...row,
          timestamp: row.timestamp ? new Date(row.timestamp).toISOString() : "",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
          deliveredAt: row.deliveredAt ? new Date(row.deliveredAt).toISOString() : "",
          readAt: row.readAt ? new Date(row.readAt).toISOString() : ""
        })),
        notifications: notificationsResult.rows.map((row) => ({
          ...row,
          readAt: row.readAt ? new Date(row.readAt).toISOString() : "",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : ""
        })),
        promotions: promotionsResult.rows.map((row) => ({
          ...row,
          startDate: row.startDate ? new Date(row.startDate).toISOString() : "",
          endDate: row.endDate ? new Date(row.endDate).toISOString() : "",
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
          updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : "",
          approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : "",
          baselineViews: Number(row.baselineViews || 0),
          baselineLikes: Number(row.baselineLikes || 0),
          disabledAt: row.disabledAt ? new Date(row.disabledAt).toISOString() : ""
        })),
        reviews: reviewsResult.rows.map((row) => ({
          ...row,
          date: row.date ? new Date(row.date).toISOString() : ""
        })),
        reports: reportsResult.rows.map((row) => ({
          ...row,
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : "",
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : ""
      })),
      moderationActions: moderationActionsResult.rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : ""
      })),
      settings: parseJson(settingsResult.rows[0]?.settings, {})
    };
  }

  async function readProductsPage(options = {}) {
    const requestedLimit = Number.parseInt(options.limit, 10);
    const requestedPage = Number.parseInt(options.page, 10);
    const requestedOffset = Number.parseInt(options.offset, 10);
    const requestedMaxLimit = Number.parseInt(options.maxLimit, 10);
    const maxLimit = Number.isFinite(requestedMaxLimit) && requestedMaxLimit > 0
      ? Math.min(Math.floor(requestedMaxLimit), 50)
      : 50;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), maxLimit)
      : Math.min(12, maxLimit);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0
      ? Math.floor(requestedOffset)
      : Math.max(0, (page - 1) * limit);
    const cursor = parseProductCursor(options.cursor);
    const { clauses, params: visibilityParams } = buildProductVisibilityClause({
      viewerUsername: options.viewerUsername,
      isStaffViewer: Boolean(options.isStaffViewer)
    });
    const filterParts = [...clauses];
    const filterParams = [...visibilityParams];
    const searchQuery = String(options.query || "").trim().slice(0, 120);
    const category = String(options.category || "").trim().slice(0, 80);
    const seller = String(options.seller || "").trim().slice(0, 80);

    if (searchQuery) {
      filterParams.push(`%${searchQuery}%`);
      filterParts.push(`(
        name ILIKE $${filterParams.length}
        OR shop ILIKE $${filterParams.length}
        OR uploaded_by ILIKE $${filterParams.length}
        OR category ILIKE $${filterParams.length}
      )`);
    }
    if (category && category !== "all") {
      filterParams.push(category, `${category}-%`);
      filterParts.push(`(category = $${filterParams.length - 1} OR category LIKE $${filterParams.length})`);
    }
    if (seller) {
      filterParams.push(seller);
      filterParts.push(`uploaded_by = $${filterParams.length}`);
    }

    const countWhereParts = [...filterParts];
    const itemWhereParts = [...filterParts];
    const countParams = [...filterParams];
    const itemParams = [...filterParams];

    if (cursor) {
      itemParams.push(cursor.createdAt, cursor.id);
      itemWhereParts.push(`(created_at, id) < ($${itemParams.length - 1}::timestamptz, $${itemParams.length}::text)`);
    }

    const itemWhereSql = itemWhereParts.length ? `WHERE ${itemWhereParts.join(" AND ")}` : "";
    const countWhereSql = countWhereParts.length ? `WHERE ${countWhereParts.join(" AND ")}` : "";
    const itemLimit = limit + 1;
    let itemsSql = `
      SELECT
        p.id,
        p.name,
        p.price::float8 AS price,
        p.shop,
        p.whatsapp,
        p.image,
        p.images,
        p.uploaded_by AS "uploadedBy",
        p.category,
        p.status,
        p.availability,
        p.moderation_note AS "moderationNote",
        p.moderated_at AS "moderatedAt",
        p.moderated_by AS "moderatedBy",
        p.original_product_id AS "originalProductId",
        p.original_seller_id AS "originalSellerId",
        p.reseller_id AS "resellerId",
        p.resale_price::float8 AS "resalePrice",
        p.resold_status AS "resoldStatus",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt",
        p.likes,
        p.views,
        p.viewed_by AS "viewedBy",
        COALESCE(pds.total_demand, 0)::int AS "demandTotalDemand",
        COALESCE(pds.waiting_users, 0)::int AS "demandWaitingUsers",
        COALESCE(pds.restock_interest, 0)::int AS "demandRestockInterest",
        COALESCE(pds.demand_score, 0)::float8 AS "demandScore",
        COALESCE(pds.action_counts, '{}'::jsonb) AS "demandActionCounts",
        COALESCE(pds.top_colors, '[]'::jsonb) AS "demandTopColors",
        COALESCE(pds.top_sizes, '[]'::jsonb) AS "demandTopSizes",
        pds.last_demand_at AS "demandLastDemandAt"
      FROM products p
      LEFT JOIN product_demand_summaries pds ON pds.product_id = p.id
      ${itemWhereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT $${itemParams.length + 1}
    `;
    if (!cursor) {
      itemParams.push(itemLimit, offset);
      itemsSql += ` OFFSET $${itemParams.length}`;
    } else {
      itemParams.push(itemLimit);
    }

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM products p
      ${countWhereSql}
    `;

    const [itemsResult, countResult] = await Promise.all([
      query(itemsSql, itemParams),
      query(countSql, countParams)
    ]);

    const rawItems = Array.isArray(itemsResult.rows) ? itemsResult.rows : [];
    const hasMore = rawItems.length > limit;
    const items = (hasMore ? rawItems.slice(0, limit) : rawItems)
      .map(normalizeProductRow)
      .filter(Boolean);
    const total = Number(countResult.rows[0]?.total || 0);
    const lastItem = items[items.length - 1] || null;
    const nextCursor = hasMore && lastItem?.createdAt && lastItem?.id
      ? `${lastItem.createdAt}|${lastItem.id}`
      : "";

    return {
      items,
      nextCursor,
      hasMore,
      total,
      page,
      limit
    };
  }

  async function appendAuditLog(entry) {
    await query(
      "INSERT INTO audit_logs (time, event, entry) VALUES ($1, $2, $3::jsonb)",
      [entry.time || new Date().toISOString(), entry.event || "unknown", JSON.stringify(entry)]
    );
  }

  async function appendIntelligenceEvent(event, scores = {}) {
    const metadata = {
      ...(event.metadata || {}),
      ...(event.quality ? { signalQuality: event.quality } : {})
    };
    await query(
      `INSERT INTO intelligence_events (
        event_id, event_type, source_event, happened_at, product_id, seller_id,
        buyer_id, session_id, feed_context, location, device_type, app_version,
        level, category, alert_severity, metadata, platform_version
      ) VALUES (
        $1, $2, $3, $4::timestamptz, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16::jsonb, $17
      )
      ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        event.eventType,
        event.sourceEvent || "",
        event.timestamp || new Date().toISOString(),
        event.productId || "",
        event.sellerId || "",
        event.buyerId || "",
        event.sessionId || "",
        event.feedContext || "",
        event.location || "",
        event.deviceType || "",
        event.appVersion || "",
        event.level || "",
        event.category || "",
        event.alertSeverity || "",
        JSON.stringify(metadata),
        event.platformVersion || ""
      ]
    );

    if (scores.productScore?.id) {
      await query(
        `INSERT INTO product_intelligence_scores (
          product_id, score, signals, first_seen_at, last_seen_at, updated_at
        ) VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, NOW())
        ON CONFLICT (product_id) DO UPDATE SET
          score = EXCLUDED.score,
          signals = EXCLUDED.signals,
          first_seen_at = LEAST(product_intelligence_scores.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(product_intelligence_scores.last_seen_at, EXCLUDED.last_seen_at),
          updated_at = NOW()`,
        [
          scores.productScore.id,
          Number(scores.productScore.score || 0),
          JSON.stringify(scores.productScore.signals || {}),
          scores.productScore.firstSeenAt || event.timestamp || new Date().toISOString(),
          scores.productScore.lastSeenAt || event.timestamp || new Date().toISOString()
        ]
      );
    }

    if (scores.sellerScore?.id) {
      await query(
        `INSERT INTO seller_intelligence_scores (
          seller_id, score, signals, first_seen_at, last_seen_at, updated_at
        ) VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz, NOW())
        ON CONFLICT (seller_id) DO UPDATE SET
          score = EXCLUDED.score,
          signals = EXCLUDED.signals,
          first_seen_at = LEAST(seller_intelligence_scores.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(seller_intelligence_scores.last_seen_at, EXCLUDED.last_seen_at),
          updated_at = NOW()`,
        [
          scores.sellerScore.id,
          Number(scores.sellerScore.score || 0),
          JSON.stringify(scores.sellerScore.signals || {}),
          scores.sellerScore.firstSeenAt || event.timestamp || new Date().toISOString(),
          scores.sellerScore.lastSeenAt || event.timestamp || new Date().toISOString()
        ]
      );
    }
  }

  async function enqueueIntelligenceEvent(event, scores = {}) {
    const result = await query(
      `INSERT INTO intelligence_event_queue (
        event_id, event_payload, score_payload, status, available_at, updated_at
      ) VALUES ($1, $2::jsonb, $3::jsonb, 'pending', NOW(), NOW())
      ON CONFLICT (event_id) DO NOTHING`,
      [
        event.eventId,
        JSON.stringify(event || {}),
        JSON.stringify(scores || {})
      ]
    );
    return { enqueued: Number(result.rowCount || 0) > 0 };
  }

  async function claimIntelligenceQueueBatch(options = {}) {
    const limit = Math.max(1, Math.min(Number(options.limit || 25) || 25, 100));
    const workerId = String(options.workerId || "winga-intelligence-worker").slice(0, 120);
    const result = await query(
      `WITH next_jobs AS (
        SELECT queue_id
        FROM intelligence_event_queue
        WHERE status IN ('pending', 'failed')
          AND available_at <= NOW()
        ORDER BY queue_id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE intelligence_event_queue q
      SET status = 'processing',
          attempts = q.attempts + 1,
          locked_at = NOW(),
          locked_by = $2,
          updated_at = NOW()
      FROM next_jobs
      WHERE q.queue_id = next_jobs.queue_id
      RETURNING
        q.queue_id AS "queueId",
        q.event_id AS "eventId",
        q.event_payload AS "event",
        q.score_payload AS "scores",
        q.attempts`,
      [limit, workerId]
    );
    return result.rows.map((row) => ({
      queueId: Number(row.queueId || 0),
      eventId: row.eventId,
      event: row.event || {},
      scores: row.scores || {},
      attempts: Number(row.attempts || 0)
    }));
  }

  async function completeIntelligenceQueueItem(queueId) {
    await query(
      `UPDATE intelligence_event_queue
       SET status = 'completed',
           processed_at = NOW(),
           locked_at = NULL,
           locked_by = '',
           last_error = '',
           updated_at = NOW()
       WHERE queue_id = $1`,
      [Number(queueId || 0)]
    );
  }

  async function failIntelligenceQueueItem(queueId, error, options = {}) {
    const attempts = Math.max(1, Number(options.attempts || 1) || 1);
    const maxAttempts = Math.max(1, Number(options.maxAttempts || 12) || 12);
    const backoffSeconds = Math.min(3600, Math.max(5, attempts * attempts * 10));
    const terminal = attempts >= maxAttempts;
    await query(
      `UPDATE intelligence_event_queue
       SET status = $2,
           available_at = CASE WHEN $2 = 'failed' THEN NOW() + ($3 || ' seconds')::interval ELSE available_at END,
           locked_at = NULL,
           locked_by = '',
           last_error = $4,
           updated_at = NOW()
       WHERE queue_id = $1`,
      [
        Number(queueId || 0),
        terminal ? "dead" : "failed",
        String(backoffSeconds),
        String(error?.message || error || "unknown").slice(0, 500)
      ]
    );
  }

  async function readIntelligenceQueueJobs(options = {}) {
    const allowedStatuses = new Set(["pending", "processing", "failed", "dead", "completed"]);
    const statuses = (Array.isArray(options.statuses) ? options.statuses : ["failed", "dead"])
      .map((status) => String(status || "").trim().toLowerCase())
      .filter((status) => allowedStatuses.has(status));
    const safeStatuses = statuses.length ? Array.from(new Set(statuses)) : ["failed", "dead"];
    const limit = Math.max(1, Math.min(Number(options.limit || 50) || 50, 100));
    const cursor = Number(options.cursor || 0) || 0;
    const params = [safeStatuses, limit + 1];
    const cursorClause = cursor > 0 ? "AND queue_id < $3" : "";
    if (cursor > 0) {
      params.push(cursor);
    }
    const result = await query(
      `SELECT
         queue_id,
         event_id,
         status,
         attempts,
         available_at,
         locked_at,
         locked_by,
         processed_at,
         last_error,
         created_at,
         updated_at,
         event_payload->>'eventType' AS event_type,
         event_payload->>'productId' AS product_id,
         event_payload->>'sellerId' AS seller_id,
         event_payload->>'sourceEvent' AS source_event
       FROM intelligence_event_queue
       WHERE status = ANY($1::text[])
       ${cursorClause}
       ORDER BY queue_id DESC
       LIMIT $2`,
      params
    );
    const rows = result.rows || [];
    const items = rows.slice(0, limit).map((row) => ({
      queueId: Number(row.queue_id || 0),
      eventId: row.event_id || "",
      eventType: row.event_type || "",
      sourceEvent: row.source_event || "",
      productId: row.product_id || "",
      sellerId: row.seller_id || "",
      status: row.status || "",
      attempts: Number(row.attempts || 0),
      availableAt: row.available_at || null,
      lockedAt: row.locked_at || null,
      lockedBy: row.locked_by || "",
      processedAt: row.processed_at || null,
      lastError: String(row.last_error || "").slice(0, 500),
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    }));
    return {
      items,
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? String(items[items.length - 1]?.queueId || "") : "",
      statuses: safeStatuses
    };
  }

  async function retryIntelligenceQueueItems(queueIds = []) {
    const safeIds = Array.from(new Set((Array.isArray(queueIds) ? queueIds : [])
      .map((queueId) => Number(queueId || 0))
      .filter((queueId) => Number.isInteger(queueId) && queueId > 0)))
      .slice(0, 100);
    if (!safeIds.length) {
      return { retried: 0 };
    }
    const result = await query(
      `UPDATE intelligence_event_queue
       SET status = 'pending',
           attempts = 0,
           available_at = NOW(),
           locked_at = NULL,
           locked_by = '',
           processed_at = NULL,
           last_error = '',
           updated_at = NOW()
       WHERE queue_id = ANY($1::bigint[])
         AND status IN ('failed', 'dead')`,
      [safeIds]
    );
    return { retried: Number(result.rowCount || 0), requested: safeIds.length };
  }

  async function markIntelligenceQueueItemsDead(queueIds = [], reason = "") {
    const safeIds = Array.from(new Set((Array.isArray(queueIds) ? queueIds : [])
      .map((queueId) => Number(queueId || 0))
      .filter((queueId) => Number.isInteger(queueId) && queueId > 0)))
      .slice(0, 100);
    if (!safeIds.length) {
      return { markedDead: 0 };
    }
    const safeReason = String(reason || "Manually marked dead by ops").slice(0, 500);
    const result = await query(
      `UPDATE intelligence_event_queue
       SET status = 'dead',
           locked_at = NULL,
           locked_by = '',
           last_error = $2,
           updated_at = NOW()
       WHERE queue_id = ANY($1::bigint[])
         AND status IN ('pending', 'failed', 'processing')`,
      [safeIds, safeReason]
    );
    return { markedDead: Number(result.rowCount || 0), requested: safeIds.length };
  }

  async function readIntelligenceQueueHealth() {
    const result = await query(
      `SELECT status, COUNT(*)::int AS count
       FROM intelligence_event_queue
       GROUP BY status`
    );
    const byStatus = {};
    result.rows.forEach((row) => {
      byStatus[row.status || "unknown"] = Number(row.count || 0);
    });
    const metrics = await query(
      `SELECT
         COALESCE(EXTRACT(EPOCH FROM (NOW() - (MIN(created_at) FILTER (WHERE status = 'pending'))))::int, 0) AS oldest_pending_age_seconds,
         COALESCE(EXTRACT(EPOCH FROM (NOW() - (MIN(updated_at) FILTER (WHERE status = 'failed'))))::int, 0) AS oldest_failed_age_seconds,
         COALESCE(EXTRACT(EPOCH FROM (NOW() - (MIN(locked_at) FILTER (WHERE status = 'processing' AND locked_at IS NOT NULL))))::int, 0) AS oldest_processing_age_seconds,
         COALESCE(EXTRACT(EPOCH FROM (NOW() - (MAX(processed_at) FILTER (WHERE status = 'completed'))))::int, 0) AS seconds_since_last_completed,
         MAX(processed_at) FILTER (WHERE status = 'completed') AS last_completed_at,
         MAX(updated_at) AS last_changed_at,
         COALESCE(MAX(attempts), 0)::int AS max_attempts_seen
       FROM intelligence_event_queue`
    );
    const metricRow = metrics.rows[0] || {};
    return {
      pending: byStatus.pending || 0,
      processing: byStatus.processing || 0,
      failed: byStatus.failed || 0,
      completed: byStatus.completed || 0,
      dead: byStatus.dead || 0,
      oldestPendingAgeSeconds: Number(metricRow.oldest_pending_age_seconds || 0),
      oldestFailedAgeSeconds: Number(metricRow.oldest_failed_age_seconds || 0),
      oldestProcessingAgeSeconds: Number(metricRow.oldest_processing_age_seconds || 0),
      secondsSinceLastCompleted: Number(metricRow.seconds_since_last_completed || 0),
      lastCompletedAt: metricRow.last_completed_at || null,
      lastChangedAt: metricRow.last_changed_at || null,
      maxAttemptsSeen: Number(metricRow.max_attempts_seen || 0)
    };
  }

  async function recoverStaleIntelligenceQueueJobs(options = {}) {
    const staleSeconds = Math.max(60, Math.min(Number(options.staleSeconds || 300) || 300, 86400));
    const result = await query(
      `UPDATE intelligence_event_queue
       SET status = 'failed',
           available_at = NOW(),
           locked_at = NULL,
           locked_by = '',
           last_error = 'Recovered stale processing job',
           updated_at = NOW()
       WHERE status = 'processing'
         AND locked_at < NOW() - ($1 || ' seconds')::interval`,
      [String(staleSeconds)]
    );
    return { recovered: Number(result.rowCount || 0) };
  }

  async function pruneCompletedIntelligenceQueueJobs(options = {}) {
    const retentionHours = Math.max(1, Math.min(Number(options.retentionHours || 72) || 72, 24 * 90));
    const result = await query(
      `DELETE FROM intelligence_event_queue
       WHERE status = 'completed'
         AND processed_at < NOW() - ($1 || ' hours')::interval`,
      [String(retentionHours)]
    );
    return { pruned: Number(result.rowCount || 0) };
  }

  async function pruneIntelligenceRawEvents(options = {}) {
    const intelligenceDays = Math.max(7, Math.min(Number(options.intelligenceDays || 180) || 180, 3650));
    const demandDays = Math.max(30, Math.min(Number(options.demandDays || 730) || 730, 3650));
    const searchDays = Math.max(7, Math.min(Number(options.searchDays || 365) || 365, 3650));
    const [intelligence, demand, search] = await Promise.all([
      query(
        `DELETE FROM intelligence_events
         WHERE happened_at < NOW() - ($1 || ' days')::interval`,
        [String(intelligenceDays)]
      ),
      query(
        `DELETE FROM demand_events
         WHERE created_at < NOW() - ($1 || ' days')::interval`,
        [String(demandDays)]
      ),
      query(
        `DELETE FROM search_demand_events
         WHERE happened_at < NOW() - ($1 || ' days')::interval`,
        [String(searchDays)]
      )
    ]);
    return {
      intelligenceEvents: Number(intelligence.rowCount || 0),
      demandEvents: Number(demand.rowCount || 0),
      searchDemandEvents: Number(search.rowCount || 0),
      retentionDays: {
        intelligence: intelligenceDays,
        demand: demandDays,
        search: searchDays
      }
    };
  }

  async function refreshIntelligenceDailySnapshots(options = {}) {
    const windowDays = Math.max(1, Math.min(Number(options.windowDays || 14) || 14, 90));
    const retentionDays = Math.max(30, Math.min(Number(options.retentionDays || 1095) || 1095, 3650));
    const [eventTypes, demandProducts, searchQueries, pruned] = await Promise.all([
      query(
        `INSERT INTO intelligence_daily_snapshots (
           snapshot_date,
           snapshot_type,
           snapshot_key,
           count,
           score,
           metric,
           updated_at
         )
         SELECT
           happened_at::date AS snapshot_date,
           'event_type' AS snapshot_type,
           event_type AS snapshot_key,
           COUNT(*)::int AS count,
           COUNT(*)::numeric(12, 2) AS score,
           jsonb_build_object(
             'sampleProductId', MAX(product_id),
             'sampleSellerId', MAX(seller_id),
             'lastSeenAt', MAX(happened_at)
           ) AS metric,
           NOW() AS updated_at
         FROM intelligence_events
         WHERE happened_at >= NOW() - ($1 || ' days')::interval
           AND event_type <> ''
         GROUP BY happened_at::date, event_type
         ON CONFLICT (snapshot_date, snapshot_type, snapshot_key)
         DO UPDATE SET
           count = EXCLUDED.count,
           score = EXCLUDED.score,
           metric = EXCLUDED.metric,
           updated_at = NOW()`,
        [String(windowDays)]
      ),
      query(
        `INSERT INTO intelligence_daily_snapshots (
           snapshot_date,
           snapshot_type,
           snapshot_key,
           count,
           score,
           metric,
           updated_at
         )
         SELECT
           created_at::date AS snapshot_date,
           'demand_product' AS snapshot_type,
           product_id AS snapshot_key,
           COUNT(*)::int AS count,
           COALESCE(SUM(demand_score), 0)::numeric(12, 2) AS score,
           jsonb_build_object(
             'sellerId', MAX(seller_id),
             'waitingUsers', COUNT(DISTINCT NULLIF(COALESCE(NULLIF(buyer_id, ''), NULLIF(session_id, '')), '')),
             'restockInterest', COUNT(*) FILTER (WHERE action IN ('notify_when_available', 'want_back')),
             'sampleColor', MAX(NULLIF(color, '')),
             'sampleSize', MAX(NULLIF(size, '')),
             'sampleAction', MAX(action),
             'lastDemandAt', MAX(created_at)
           ) AS metric,
           NOW() AS updated_at
         FROM demand_events
         WHERE created_at >= NOW() - ($1 || ' days')::interval
           AND product_id <> ''
         GROUP BY created_at::date, product_id
         ON CONFLICT (snapshot_date, snapshot_type, snapshot_key)
         DO UPDATE SET
           count = EXCLUDED.count,
           score = EXCLUDED.score,
           metric = EXCLUDED.metric,
           updated_at = NOW()`,
        [String(windowDays)]
      ),
      query(
        `INSERT INTO intelligence_daily_snapshots (
           snapshot_date,
           snapshot_type,
           snapshot_key,
           count,
           score,
           metric,
           updated_at
         )
         SELECT
           happened_at::date AS snapshot_date,
           'search_query' AS snapshot_type,
           query_key AS snapshot_key,
           COUNT(*)::int AS count,
           (
             COUNT(*) +
             COUNT(*) FILTER (WHERE zero_result) * 3 +
             COUNT(*) FILTER (WHERE clicked_product_id <> '') * 2
           )::numeric(12, 2) AS score,
           jsonb_build_object(
             'query', MAX(query),
             'category', MAX(detected_category),
             'color', MAX(detected_color),
             'source', MAX(source),
             'zeroResults', COUNT(*) FILTER (WHERE zero_result),
             'clickedResults', COUNT(*) FILTER (WHERE clicked_product_id <> ''),
             'lastSearchedAt', MAX(happened_at)
           ) AS metric,
           NOW() AS updated_at
         FROM search_demand_events
         WHERE happened_at >= NOW() - ($1 || ' days')::interval
           AND query_key <> ''
         GROUP BY happened_at::date, query_key
         ON CONFLICT (snapshot_date, snapshot_type, snapshot_key)
         DO UPDATE SET
           count = EXCLUDED.count,
           score = EXCLUDED.score,
           metric = EXCLUDED.metric,
           updated_at = NOW()`,
        [String(windowDays)]
      ),
      query(
        `DELETE FROM intelligence_daily_snapshots
         WHERE snapshot_date < CURRENT_DATE - ($1 || ' days')::interval`,
        [String(retentionDays)]
      )
    ]);
    return {
      eventTypes: Number(eventTypes.rowCount || 0),
      demandProducts: Number(demandProducts.rowCount || 0),
      searchQueries: Number(searchQueries.rowCount || 0),
      prunedSnapshots: Number(pruned.rowCount || 0),
      windowDays,
      retentionDays
    };
  }

  async function readIntelligenceSnapshotSummary(options = {}) {
    const days = Math.max(1, Math.min(Number(options.days || 14) || 14, 90));
    const limit = Math.max(1, Math.min(Number(options.limit || 10) || 10, 50));
    const result = await query(
      `SELECT
         snapshot_type AS "snapshotType",
         snapshot_key AS "snapshotKey",
         SUM(count)::int AS count,
         SUM(score)::float8 AS score,
         jsonb_build_object(
           'lastUpdatedAt', MAX(updated_at),
           'lastMetric', (array_agg(metric ORDER BY snapshot_date DESC, updated_at DESC))[1]
         ) AS metric,
         MAX(updated_at) AS "updatedAt"
       FROM intelligence_daily_snapshots
       WHERE snapshot_date >= CURRENT_DATE - ($1 || ' days')::interval
       GROUP BY snapshot_type, snapshot_key
       ORDER BY score DESC, count DESC, snapshot_type ASC, snapshot_key ASC
       LIMIT $2`,
      [String(days), limit]
    );
    return result.rows.map((row) => ({
      snapshotType: row.snapshotType,
      snapshotKey: row.snapshotKey,
      count: Number(row.count || 0),
      score: Number(row.score || 0),
      metric: row.metric || {},
      updatedAt: toISOString(row.updatedAt)
    }));
  }

  async function readIntelligenceSnapshotHealth(options = {}) {
    const windowDays = Math.max(1, Math.min(Number(options.windowDays || 14) || 14, 90));
    const [snapshotEstimate, recentSnapshotMetrics, latestSnapshotMetrics, rawMetrics] = await Promise.all([
      query(
        `SELECT
           GREATEST(COALESCE(reltuples, 0), 0)::bigint AS estimated_total_snapshots
         FROM pg_class
         WHERE oid = 'intelligence_daily_snapshots'::regclass`,
        []
      ),
      query(
        `SELECT COUNT(*)::int AS recent_snapshots
         FROM intelligence_daily_snapshots
         WHERE snapshot_date >= CURRENT_DATE - ($1 || ' days')::interval`,
        [String(windowDays)]
      ),
      query(
        `SELECT
           snapshot_date AS latest_snapshot_date,
           updated_at AS latest_updated_at,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - updated_at))::int, 0) AS seconds_since_latest_update
         FROM intelligence_daily_snapshots
         ORDER BY updated_at DESC
         LIMIT 1`,
        []
      ),
      query(
        `SELECT
           (
             SELECT COUNT(*)::int
             FROM intelligence_events
             WHERE happened_at >= NOW() - ($1 || ' days')::interval
           ) AS intelligence_events,
           (
             SELECT COUNT(*)::int
             FROM demand_events
             WHERE created_at >= NOW() - ($1 || ' days')::interval
           ) AS demand_events,
           (
             SELECT COUNT(*)::int
             FROM search_demand_events
             WHERE happened_at >= NOW() - ($1 || ' days')::interval
           ) AS search_demand_events`,
        [String(windowDays)]
      )
    ]);
    const estimateRow = snapshotEstimate.rows[0] || {};
    const recentSnapshotRow = recentSnapshotMetrics.rows[0] || {};
    const latestSnapshotRow = latestSnapshotMetrics.rows[0] || {};
    const rawRow = rawMetrics.rows[0] || {};
    const raw = {
      intelligenceEvents: Number(rawRow.intelligence_events || 0),
      demandEvents: Number(rawRow.demand_events || 0),
      searchDemandEvents: Number(rawRow.search_demand_events || 0)
    };
    return {
      estimatedTotalSnapshots: Number(estimateRow.estimated_total_snapshots || 0),
      recentSnapshots: Number(recentSnapshotRow.recent_snapshots || 0),
      latestSnapshotDate: latestSnapshotRow.latest_snapshot_date ? String(latestSnapshotRow.latest_snapshot_date).slice(0, 10) : "",
      latestUpdatedAt: toISOString(latestSnapshotRow.latest_updated_at),
      secondsSinceLatestUpdate: Number(latestSnapshotRow.seconds_since_latest_update || 0),
      recentRawEvents: raw,
      recentRawEventCount: raw.intelligenceEvents + raw.demandEvents + raw.searchDemandEvents,
      windowDays
    };
  }

  async function readIntelligenceSummary(limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const [eventTypes, products, sellers, snapshots] = await Promise.all([
      query(
        `SELECT event_type AS "eventType", COUNT(*)::int AS count
         FROM intelligence_events
         WHERE happened_at >= NOW() - INTERVAL '24 hours'
         GROUP BY event_type
         ORDER BY count DESC, event_type ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT product_id AS id, score::float AS score, signals, last_seen_at AS "lastSeenAt"
         FROM product_intelligence_scores
         ORDER BY score DESC, last_seen_at DESC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT seller_id AS id, score::float AS score, signals, last_seen_at AS "lastSeenAt"
         FROM seller_intelligence_scores
         ORDER BY score DESC, last_seen_at DESC
         LIMIT $1`,
        [safeLimit]
      ),
      readIntelligenceSnapshotSummary({ days: 14, limit: safeLimit })
    ]);

    return {
      topEventTypes: eventTypes.rows.map((row) => ({
        eventType: row.eventType,
        count: Number(row.count || 0)
      })),
      topProducts: products.rows.map((row) => ({
        id: row.id,
        score: Number(row.score || 0),
        signals: row.signals || {},
        lastSeenAt: toISOString(row.lastSeenAt)
      })),
      topSellers: sellers.rows.map((row) => ({
        id: row.id,
        score: Number(row.score || 0),
        signals: row.signals || {},
        lastSeenAt: toISOString(row.lastSeenAt)
      })),
      trendSnapshots: snapshots
    };
  }

  async function refreshProductDemandSummary(productId = "") {
    const safeProductId = String(productId || "").trim();
    if (!safeProductId) {
      return null;
    }
    const result = await query(
      `WITH source AS (
         SELECT *
         FROM demand_events
         WHERE product_id = $1
       ),
       aggregate AS (
         SELECT
           product_id,
           MAX(seller_id) AS seller_id,
           COUNT(*)::int AS total_demand,
           COUNT(DISTINCT NULLIF(COALESCE(NULLIF(buyer_id, ''), NULLIF(session_id, '')), ''))::int AS waiting_users,
           COUNT(*) FILTER (WHERE action IN ('notify_when_available', 'want_back'))::int AS restock_interest,
           COALESCE(SUM(demand_score), 0)::float8 AS demand_score,
           MIN(created_at) AS first_demand_at,
           MAX(created_at) AS last_demand_at
         FROM source
         GROUP BY product_id
       ),
       action_counts AS (
         SELECT COALESCE(jsonb_object_agg(action, count), '{}'::jsonb) AS value
         FROM (
           SELECT action, COUNT(*)::int AS count
           FROM source
           GROUP BY action
         ) actions
       ),
       top_colors AS (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('color', color, 'count', count) ORDER BY count DESC, color ASC), '[]'::jsonb) AS value
         FROM (
           SELECT color, COUNT(*)::int AS count
           FROM source
           WHERE color <> ''
           GROUP BY color
           ORDER BY count DESC, color ASC
           LIMIT 5
         ) colors
       ),
       top_sizes AS (
         SELECT COALESCE(jsonb_agg(jsonb_build_object('size', size, 'count', count) ORDER BY count DESC, size ASC), '[]'::jsonb) AS value
         FROM (
           SELECT size, COUNT(*)::int AS count
           FROM source
           WHERE size <> ''
           GROUP BY size
           ORDER BY count DESC, size ASC
           LIMIT 5
         ) sizes
       )
       INSERT INTO product_demand_summaries (
         product_id, seller_id, total_demand, waiting_users, restock_interest,
         demand_score, action_counts, top_colors, top_sizes,
         first_demand_at, last_demand_at, updated_at
       )
       SELECT
         aggregate.product_id,
         aggregate.seller_id,
         aggregate.total_demand,
         aggregate.waiting_users,
         aggregate.restock_interest,
         aggregate.demand_score,
         action_counts.value,
         top_colors.value,
         top_sizes.value,
         aggregate.first_demand_at,
         aggregate.last_demand_at,
         NOW()
       FROM aggregate, action_counts, top_colors, top_sizes
       ON CONFLICT (product_id) DO UPDATE SET
         seller_id = EXCLUDED.seller_id,
         total_demand = EXCLUDED.total_demand,
         waiting_users = EXCLUDED.waiting_users,
         restock_interest = EXCLUDED.restock_interest,
         demand_score = EXCLUDED.demand_score,
         action_counts = EXCLUDED.action_counts,
         top_colors = EXCLUDED.top_colors,
         top_sizes = EXCLUDED.top_sizes,
         first_demand_at = EXCLUDED.first_demand_at,
         last_demand_at = EXCLUDED.last_demand_at,
         updated_at = NOW()
       RETURNING
         product_id AS "productId",
         seller_id AS "sellerId",
         total_demand AS "totalDemand",
         waiting_users AS "waitingUsers",
         restock_interest AS "restockInterest",
         demand_score::float8 AS "demandScore",
         action_counts AS "actionCounts",
         top_colors AS "topColors",
         top_sizes AS "topSizes",
         first_demand_at AS "firstDemandAt",
         last_demand_at AS "lastDemandAt",
         updated_at AS "updatedAt"`,
      [safeProductId]
    );
    const row = result.rows[0];
    return row ? {
      ...row,
      demandScore: Number(row.demandScore || 0),
      firstDemandAt: toISOString(row.firstDemandAt),
      lastDemandAt: toISOString(row.lastDemandAt),
      updatedAt: toISOString(row.updatedAt)
    } : null;
  }

  async function appendDemandEvent(event = {}) {
    const insertResult = await query(
      `INSERT INTO demand_events (
        demand_id, dedupe_key, product_id, seller_id, buyer_id, session_id,
        action, color, size, country, region, demand_score, metadata, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12, $13::jsonb, $14::timestamptz
      )
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING demand_id`,
      [
        event.demandId,
        event.dedupeKey,
        event.productId,
        event.sellerId,
        event.buyerId || "",
        event.sessionId || "",
        event.action,
        event.color || "",
        event.size || "",
        event.country || "",
        event.region || "",
        Number(event.demandScore || 0),
        JSON.stringify(event.metadata || {}),
        event.createdAt || new Date().toISOString()
      ]
    );
    const inserted = insertResult.rowCount > 0;
    const summary = await refreshProductDemandSummary(event.productId);
    return { inserted, summary };
  }

  async function readSellerDemandSummary(sellerId = "", limit = 10) {
    const safeSellerId = String(sellerId || "").trim().slice(0, 80);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    if (!safeSellerId) {
      return [];
    }
    const result = await query(
      `SELECT
         product_id AS "productId",
         seller_id AS "sellerId",
         total_demand AS "totalDemand",
         waiting_users AS "waitingUsers",
         restock_interest AS "restockInterest",
         demand_score::float8 AS "demandScore",
         action_counts AS "actionCounts",
         top_colors AS "topColors",
         top_sizes AS "topSizes",
         first_demand_at AS "firstDemandAt",
         last_demand_at AS "lastDemandAt",
         updated_at AS "updatedAt"
       FROM product_demand_summaries
       WHERE seller_id = $1
       ORDER BY demand_score DESC, last_demand_at DESC NULLS LAST
       LIMIT $2`,
      [safeSellerId, safeLimit]
    );
    return result.rows.map((row) => ({
      ...row,
      demandScore: Number(row.demandScore || 0),
      firstDemandAt: toISOString(row.firstDemandAt),
      lastDemandAt: toISOString(row.lastDemandAt),
      updatedAt: toISOString(row.updatedAt)
    }));
  }

  async function appendSearchDemandEvents(events = []) {
    const sourceEvents = Array.isArray(events) ? events.slice(0, 25) : [];
    let inserted = 0;
    for (const event of sourceEvents) {
      const result = await query(
        `INSERT INTO search_demand_events (
          event_id, dedupe_key, happened_at, query, query_key, detected_category,
          detected_product_type, detected_color, detected_brand, detected_style,
          price_range, country, region, location, source, result_count,
          clicked_product_id, no_click, zero_result, metadata
        ) VALUES (
          $1, $2, $3::timestamptz, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20::jsonb
        )
        ON CONFLICT (dedupe_key) DO NOTHING`,
        [
          event.eventId,
          event.dedupeKey,
          event.timestamp || new Date().toISOString(),
          event.query || "",
          event.queryKey,
          event.detectedCategory || "",
          event.detectedProductType || "",
          event.detectedColor || "",
          event.detectedBrand || "",
          event.detectedStyle || "",
          event.priceRange || "",
          event.country || "",
          event.region || "",
          event.location || "",
          event.source || "text",
          Number(event.resultCount || 0),
          event.clickedProductId || "",
          Boolean(event.noClick),
          Boolean(event.zeroResult),
          JSON.stringify(event.metadata || {})
        ]
      );
      inserted += Number(result.rowCount || 0);
    }
    return { inserted, received: sourceEvents.length };
  }

  async function readSearchDemandSummary(limit = 10) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
    const [queries, categories, colors, regions, zeroResults, lowSupply] = await Promise.all([
      query(
        `SELECT query, query_key AS "queryKey", MAX(detected_category) AS category, MAX(location) AS location,
                COUNT(*)::int AS searches,
                SUM(CASE WHEN happened_at >= NOW() - INTERVAL '7 days' THEN 2 ELSE 1 END)::float8 AS score
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days'
         GROUP BY query, query_key
         ORDER BY score DESC, searches DESC, query_key ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT detected_category AS category, COUNT(*)::int AS searches
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days' AND detected_category <> ''
         GROUP BY detected_category
         ORDER BY searches DESC, detected_category ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT detected_color AS color, COUNT(*)::int AS searches
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days' AND detected_color <> ''
         GROUP BY detected_color
         ORDER BY searches DESC, detected_color ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT location AS region, COUNT(*)::int AS searches
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days' AND location <> ''
         GROUP BY location
         ORDER BY searches DESC, location ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT query, query_key AS "queryKey", MAX(detected_category) AS category, MAX(location) AS location,
                COUNT(*)::int AS searches
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days' AND zero_result IS TRUE
         GROUP BY query, query_key
         ORDER BY searches DESC, query_key ASC
         LIMIT $1`,
        [safeLimit]
      ),
      query(
        `SELECT query, query_key AS "queryKey", MAX(detected_category) AS category,
                COUNT(*)::int AS searches
         FROM search_demand_events
         WHERE happened_at >= NOW() - INTERVAL '30 days' AND zero_result IS FALSE AND result_count BETWEEN 1 AND 3
         GROUP BY query, query_key
         ORDER BY searches DESC, query_key ASC
         LIMIT $1`,
        [safeLimit]
      )
    ]);

    return {
      version: "search-demand-postgres-v1",
      privacy: "anonymous-aggregate-only",
      trendingSearches: queries.rows.map((row) => ({
        query: row.query,
        queryKey: row.queryKey,
        category: row.category || "",
        location: row.location || "",
        searches: Number(row.searches || 0),
        score: Number(row.score || 0)
      })),
      fastestGrowingSearches: queries.rows.slice(0, safeLimit).map((row) => ({
        query: row.query,
        queryKey: row.queryKey,
        category: row.category || "",
        location: row.location || "",
        searches: Number(row.searches || 0),
        score: Number(row.score || 0)
      })),
      mostSearchedCategories: categories.rows.map((row) => ({ category: row.category, searches: Number(row.searches || 0), score: Number(row.searches || 0) })),
      mostSearchedColors: colors.rows.map((row) => ({ color: row.color, searches: Number(row.searches || 0), score: Number(row.searches || 0) })),
      regionalDemand: regions.rows.map((row) => ({ region: row.region, searches: Number(row.searches || 0), score: Number(row.searches || 0) })),
      zeroResultOpportunities: zeroResults.rows.map((row) => ({ query: row.query, queryKey: row.queryKey, category: row.category || "", location: row.location || "", searches: Number(row.searches || 0), opportunity: "high", score: Number(row.searches || 0) })),
      lowSupplyOpportunities: lowSupply.rows.map((row) => ({ query: row.query, queryKey: row.queryKey, category: row.category || "", searches: Number(row.searches || 0), supply: "low", opportunity: Number(row.searches || 0) >= 8 ? "high" : "medium", score: Number(row.searches || 0) }))
    };
  }

  async function readRecentAuditLogs(limit = 50) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
    const result = await query(
      "SELECT entry FROM audit_logs ORDER BY time DESC LIMIT $1",
      [safeLimit]
    );
    return result.rows.map((row) => row.entry || {}).filter(Boolean);
  }

  async function init(getLegacyStore) {
    await ensureSchema();

    if (await isEmpty()) {
      const legacyStore = typeof getLegacyStore === "function" ? getLegacyStore() : null;
      if (legacyStore) {
        await writeStore(legacyStore);
      }
    }
  }

  async function close() {
    if (!queryClient && typeof pool.end === "function") {
      await pool.end();
    }
  }

  return {
    init,
    readStore,
    readProductsPage,
    writeStore,
    appendIntelligenceEvent,
    enqueueIntelligenceEvent,
    claimIntelligenceQueueBatch,
    completeIntelligenceQueueItem,
    failIntelligenceQueueItem,
    readIntelligenceQueueJobs,
    retryIntelligenceQueueItems,
    markIntelligenceQueueItemsDead,
    readIntelligenceQueueHealth,
    recoverStaleIntelligenceQueueJobs,
    pruneCompletedIntelligenceQueueJobs,
    pruneIntelligenceRawEvents,
    refreshIntelligenceDailySnapshots,
    readIntelligenceSnapshotSummary,
    readIntelligenceSnapshotHealth,
    readIntelligenceSummary,
    appendDemandEvent,
    readSellerDemandSummary,
    appendSearchDemandEvents,
    readSearchDemandSummary,
    appendAuditLog,
    readRecentAuditLogs,
    close
  };
}

module.exports = {
  createPostgresStore
};
