const MAX_PASSWORD_VAULT_ENTRIES = 5;

function rotatePasswordVaultEntries(entries, newEntry, limit = MAX_PASSWORD_VAULT_ENTRIES) {
  const current = Array.isArray(entries) ? entries : [];
  return [...current, newEntry]
    .sort((left, right) => Number(left.createdAt || 0) - Number(right.createdAt || 0))
    .slice(-Math.max(1, Number(limit) || MAX_PASSWORD_VAULT_ENTRIES));
}

module.exports = {
  MAX_PASSWORD_VAULT_ENTRIES,
  rotatePasswordVaultEntries
};
