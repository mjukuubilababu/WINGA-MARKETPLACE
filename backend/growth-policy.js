function createGrowthPolicy(env = {}) {
  const mode = env.WINGA_GROWTH_COHORT_MODE || 'all';
  const names = String(env.WINGA_GROWTH_COHORT_USERS || '').split(',').map(s => s.trim()).filter(Boolean);
  const valid = names.length <= 100 && names.every(s => /^[A-Za-z0-9._-]{1,40}$/.test(s));
  const users = new Set(valid ? names : []);
  const allowed = username => mode === 'all' || mode === 'allowlist' && valid && users.has(username);
  const guests = env.WINGA_GROWTH_COHORT_GUEST_MEASUREMENT === 'true';
  return Object.freeze({
    allowsCreation: allowed,
    allowsMeasurement(source, recipient) {
      if (mode === 'all') return true;
      return allowed(source) && (recipient ? allowed(recipient) : guests);
    },
    summary: Object.freeze({ mode: ['all','allowlist','off'].includes(mode) ? mode : 'off',
      enrolledAccounts: users.size, guestMeasurement: mode === 'all' || mode === 'allowlist' && valid && users.size > 0 && guests })
  });
}
module.exports = { createGrowthPolicy };
