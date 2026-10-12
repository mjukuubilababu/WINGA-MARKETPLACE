// Read-only network utility snapshots. Ciphertext, private bodies and identities
// never leave these aggregate queries; transport acceptance is not message meaning.
function createNetworkGrowth({readQuery}){
  const ratio=(a,b)=>Number(b)?Number(a)/Number(b):null;
  async function readNetworkLoopHealth(){
    const conversation=(await readQuery(`WITH accepted AS (
      SELECT m.id,m.conversation_id,m.created_at,d.owner_id AS sender
      FROM encrypted_conversation_messages m JOIN encrypted_conversations c ON c.id=m.conversation_id AND c.kind='direct'
      JOIN conversation_crypto_devices d ON d.id=m.sender_device
      WHERE m.created_at>=NOW()-INTERVAL '30 days'
    ), firsts AS (SELECT DISTINCT ON(conversation_id) conversation_id,sender,created_at FROM accepted ORDER BY conversation_id,created_at,id),
    responses AS (SELECT f.conversation_id,f.created_at,MIN(a.created_at) AS replied_at FROM firsts f LEFT JOIN accepted a
      ON a.conversation_id=f.conversation_id AND a.sender<>f.sender AND a.created_at>=f.created_at GROUP BY f.conversation_id,f.created_at)
    SELECT COUNT(*)::int AS threads,COUNT(*) FILTER(WHERE replied_at IS NOT NULL)::int AS responded,
      AVG(EXTRACT(EPOCH FROM replied_at-created_at)) FILTER(WHERE replied_at IS NOT NULL)::float8 AS seconds,
      (SELECT COUNT(*)::int FROM accepted) AS messages,
      (SELECT COUNT(DISTINCT a.id)::int FROM accepted a JOIN encrypted_conversation_receipts r ON r.message_id=a.id AND r.kind='read'
        JOIN conversation_crypto_devices recipient ON recipient.id=r.device_id AND recipient.owner_id<>a.sender) AS read_messages
    FROM responses`)).rows[0]||{};
    const reviews=(await readQuery(`WITH eligible AS (
      SELECT r.product_id,r.seller_id,r.rating,r.date FROM reviews r JOIN products p ON p.id=r.product_id
      JOIN users product_owner ON product_owner.username=p.uploaded_by AND product_owner.status='active'
      JOIN users seller ON seller.username=r.seller_id AND seller.status='active'
      JOIN users buyer ON buyer.username=r.user_id AND buyer.status='active'
      WHERE r.date>=NOW()-INTERVAL '30 days' AND r.verified_buyer AND r.user_id<>r.seller_id AND p.uploaded_by<>r.user_id AND p.status='approved'
        AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'
        AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='review' AND content_id=r.id),'public')='public'
        AND EXISTS(SELECT 1 FROM orders o WHERE o.product_id=r.product_id AND o.buyer_username=r.user_id AND o.seller_username=r.seller_id AND o.status='delivered')
    ) SELECT COUNT(*)::int AS reviews,COUNT(DISTINCT product_id)::int AS products,COUNT(DISTINCT seller_id)::int AS sellers,
      AVG(rating)::float8 AS average_rating FROM eligible`)).rows[0]||{};
    const follows=(await readQuery(`SELECT COUNT(*)::int AS follows,COUNT(DISTINCT f.follower_username)::int AS followers,
      COUNT(DISTINCT f.followed_username)::int AS followed_people,
      COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM products p WHERE p.uploaded_by=f.followed_username AND p.status='approved' AND p.created_at>=f.created_at
        AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'))::int AS pairs_with_new_public_supply,
      COUNT(*) FILTER(WHERE EXISTS(SELECT 1 FROM product_likes l JOIN products p ON p.id=l.product_id
        WHERE l.user_id=f.follower_username AND p.uploaded_by=f.followed_username AND l.created_at>=f.created_at AND p.status='approved'
          AND COALESCE((SELECT visibility FROM public_content_visibility WHERE content_type='product' AND content_id=p.id),'public')='public'))::int AS pairs_with_save
      FROM user_follows f JOIN users follower ON follower.username=f.follower_username AND follower.status='active'
      JOIN users followed ON followed.username=f.followed_username AND followed.status='active'
      WHERE f.status='active' AND f.created_at>=NOW()-INTERVAL '30 days' AND f.follower_username<>f.followed_username
        AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker_username=f.follower_username AND b.blocked_username=f.followed_username)
          OR (b.blocked_username=f.follower_username AND b.blocker_username=f.followed_username))`)).rows[0]||{};
    return {schemaVersion:1,windowDays:30,privacy:'aggregate-only',
      conversation:{entryCount:Number(conversation.threads||0),acceptedMessages:Number(conversation.messages||0),responseCount:Number(conversation.responded||0),responseRate:ratio(conversation.responded,conversation.threads),timeToReplySeconds:conversation.seconds===null?null:Number(conversation.seconds),recipientReadCount:Number(conversation.read_messages||0)},
      trust:{verifiedPublicReviews:Number(reviews.reviews||0),reviewedProducts:Number(reviews.products||0),reviewedSellers:Number(reviews.sellers||0),averageRating:reviews.average_rating===null?null:Number(reviews.average_rating)},
      follow:{entryCount:Number(follows.follows||0),activeFollowers:Number(follows.followers||0),followedPeople:Number(follows.followed_people||0),pairsWithNewPublicSupply:Number(follows.pairs_with_new_public_supply||0),pairsWithCanonicalSave:Number(follows.pairs_with_save||0),valueRate:ratio(follows.pairs_with_save,follows.follows)},
      limitations:['Conversations measure accepted encrypted transport metadata and distinct-account replies, not decrypted meaning or organic acquisition.',
        'First message/reply is first observed in this 30-day window; recipient read acknowledgements are distinct messages, not purchases.',
        'Reviews require canonical delivered nonself orders and current public eligibility; ratings do not prove future conversion lift.',
        'Follow supply is potential public discovery, not proven impressions or delivered notifications; private purchases are never used as follow content.',
        'All figures are current canonical snapshots, not randomized causal estimates or rewards eligibility.']};
  }
  return {readNetworkLoopHealth};
}
module.exports={createNetworkGrowth};
