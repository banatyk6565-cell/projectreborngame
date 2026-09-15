const { requireAdmin } = require('./_auth');
const { readJson, writeJson } = require('../../lib/admin-store');

const TEAM_KEY = 'grayfall:admin:team';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canManageTeam');
  if (!result) return;

  try {
    const team = await readJson(TEAM_KEY, []);
    if (req.method === 'GET') return res.status(200).json({ team });
    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PUT, DELETE');
      return res.status(405).json({ error: 'Metoda niedozwolona.' });
    }

    if (req.method === 'POST') {
      const { name, role, description, icon, color } = req.body || {};
      if (!name?.trim() || !role?.trim()) return res.status(400).json({ error: 'Nazwa i rola są wymagane.' });
      const member = { id: makeId(), name: name.trim().slice(0, 80), role: role.trim().slice(0, 80), description: (description || '').trim().slice(0, 180), icon: icon || 'fa-user', color: color || 'indigo' };
      await writeJson(TEAM_KEY, [...team, member]);
      return res.status(201).json({ member });
    }

    const index = team.findIndex((member) => member.id === req.query.id);
    if (index < 0) return res.status(404).json({ error: 'Nie znaleziono członka ekipy.' });
    if (req.method === 'DELETE') {
      team.splice(index, 1);
      await writeJson(TEAM_KEY, team);
      return res.status(200).json({ ok: true });
    }

    const { name, role, description, icon, color } = req.body || {};
    if (!name?.trim() || !role?.trim()) return res.status(400).json({ error: 'Nazwa i rola są wymagane.' });
    team[index] = { ...team[index], name: name.trim().slice(0, 80), role: role.trim().slice(0, 80), description: (description || '').trim().slice(0, 180), icon: icon || 'fa-user', color: color || 'indigo' };
    await writeJson(TEAM_KEY, team);
    return res.status(200).json({ member: team[index] });
  } catch (error) {
    console.error('Błąd zarządzania ekipą:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({ error: error.message });
  }
};
