module.exports = Object.freeze({
  id: "2026091505_notification_actor_authorization",
  statements: Object.freeze([
    `ALTER TABLE notifications
     ADD COLUMN IF NOT EXISTS actor_username TEXT NOT NULL DEFAULT '';`,
    `UPDATE notifications notification
     SET actor_username = message.sender_id
     FROM messages message
     WHERE notification.actor_username = ''
       AND notification.message_id <> ''
       AND message.id = notification.message_id;`,
    `UPDATE notifications notification
     SET actor_username = product.uploaded_by
     FROM products product
     WHERE notification.actor_username = ''
       AND notification.type = 'content'
       AND product.id = notification.message_id;`,
    `UPDATE notifications notification
     SET actor_username = collection.owner_username
     FROM public_collections collection
     WHERE notification.actor_username = ''
       AND notification.type = 'content'
       AND collection.id = notification.message_id;`,
    `CREATE INDEX IF NOT EXISTS idx_notifications_user_actor_recent
     ON notifications (user_id, actor_username, created_at DESC)
     WHERE actor_username <> '';`
  ])
});
