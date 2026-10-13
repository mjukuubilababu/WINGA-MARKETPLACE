function normalizePeopleQuery(value) {
  if (typeof value !== 'string') return '';
  const query = value.trim().replace(/^@/, '').toLowerCase();
  return query.length >= 2 && query.length <= 80 && !/[\x00-\x1f\x7f]/.test(query) ? query : '';
}
async function readPeopleSearch(query, viewer, options = {}) {
  const needle = normalizePeopleQuery(options.query);
  if (!/^[A-Za-z0-9._:-]{1,40}$/.test(viewer || '') || !needle) throw Object.assign(new Error('people_search_invalid'), {code:'people_search_invalid',status:400});
  const limit = Math.max(1, Math.min(Number.parseInt(options.limit, 10) || 20, 30));
  const result = await query(`SELECT u.username, u.full_name AS "fullName", u.profile_image AS "profileImage"
    FROM users u WHERE EXISTS (SELECT 1 FROM users actor WHERE actor.username=$1 AND actor.status='active' AND actor.role IN ('buyer','seller','buyer_seller')) AND u.status = 'active' AND u.role IN ('buyer','seller','buyer_seller') AND u.username <> $1
      AND (strpos(lower(u.username),$2) > 0 OR strpos(lower(COALESCE(u.full_name,'')),$2) > 0)
      AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_username=$1 AND b.blocked_username=u.username)
        OR (b.blocker_username=u.username AND b.blocked_username=$1))
    ORDER BY (lower(u.username)=$2) DESC, (strpos(lower(u.username),$2)=1) DESC, u.username ASC LIMIT $3`, [viewer,needle,limit+1]);
  const rows=result.rows||[];
  return {items:rows.slice(0,limit).map(row=>({username:row.username,fullName:row.fullName||row.username,profileImage:row.profileImage||''})),hasMore:rows.length>limit,limit,privacy:'public-profile-only'};
}
module.exports={normalizePeopleQuery,readPeopleSearch};
