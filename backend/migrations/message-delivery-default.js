module.exports = Object.freeze({
  id: "2026092202_message_delivery_default",
  statements: Object.freeze([
    `ALTER TABLE messages ALTER COLUMN is_delivered SET DEFAULT FALSE;`
  ])
});
