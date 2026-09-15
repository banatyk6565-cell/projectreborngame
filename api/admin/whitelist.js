const { requireAdmin } = require('./_auth');
const { readJson } = require('../../lib/admin-store');

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canManageNews');
  if (!result) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoda niedozwolona.' });

  try {
    const applications = await readJson('grayfall:whitelist:applications', []);
    return res.status(200).json({ applications: applications.slice().reverse() });
  } catch (error) {
    console.error('Błąd panelu whitelisty:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({ error: error.message });
  }
};
