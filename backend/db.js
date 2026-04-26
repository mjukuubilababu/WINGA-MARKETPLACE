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

function createPostgresStore({ databaseUrl, ssl = false }) {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: ssl ? { rejectUnauthorized: false } : false
  });

  async function query(text, params = []) {
    return pool.query(text, params);
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
          disabled_at TIMESTAMPTZ NULL,
          disabled_by TEXT NOT NULL DEFAULT ''
        );
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
              updated_at, disabled_at, disabled_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7,
              $8, $9, $10, $11, $12,
              $13, $14, $15
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
        ORDER BY created_at DESC
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

  async function appendAuditLog(entry) {
    await query(
      "INSERT INTO audit_logs (time, event, entry) VALUES ($1, $2, $3::jsonb)",
      [entry.time || new Date().toISOString(), entry.event || "unknown", JSON.stringify(entry)]
    );
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

  return {
    init,
    readStore,
    writeStore,
    appendAuditLog,
    readRecentAuditLogs
  };
}

module.exports = {
  createPostgresStore
};
