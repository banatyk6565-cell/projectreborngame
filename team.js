const { requireAdmin } = require('../lib/admin-auth');
const { readJson } = require('../lib/admin-store');
const { writeJson } = require('../lib/admin-store');

const BATTLE_STATE_KEY = 'grayfall:battle:state';
const BATTLE_REPORTS_KEY = 'grayfall:battle:reports';
const BATTLE_TIMELINE_VERSION = 2;

module.exports = async function handler(req, res) {
  const requestUrl = new URL(req.url, 'http://localhost');
  const isBattleChannel = (req.query?.channel || requestUrl.searchParams.get('channel')) === 'battle';
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    if (req.method === 'GET' && isBattleChannel) {
      res.setHeader('Cache-Control', 'no-store');
      let state = await readJson(BATTLE_STATE_KEY, null);
      if (!state?.startedAt || state.scenario !== 'redwood' || state.timelineVersion !== BATTLE_TIMELINE_VERSION) {
        state = { startedAt: new Date().toISOString(), scenario: 'redwood', timelineVersion: BATTLE_TIMELINE_VERSION };
        await writeJson(BATTLE_STATE_KEY, state);
      }
      const messages = await readJson(BATTLE_REPORTS_KEY, []);
      return res.status(200).json({ state, messages });
    }

    if (req.method === 'GET') {
      const team = await readJson('grayfall:admin:team', []);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
      return res.status(200).json({ team });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action === 'reset-to-phase-one') {
      const admin = requireAdmin(req, res, 'canManageTeam');
      if (!admin) return;
      const state = {
        startedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        scenario: 'redwood',
        timelineVersion: BATTLE_TIMELINE_VERSION,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.session.globalName || 'Dowództwo',
      };
      await writeJson(BATTLE_STATE_KEY, state);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ state });
    }

    if (body.action === 'advance-to-phase-seven-end') {
      const admin = requireAdmin(req, res, 'canManageTeam');
      if (!admin) return;
      const phaseSevenEnd = 79 * 60 * 1000;
      const state = {
        startedAt: new Date(Date.now() - phaseSevenEnd).toISOString(),
        scenario: 'redwood',
        timelineVersion: BATTLE_TIMELINE_VERSION,
        updatedAt: new Date().toISOString(),
        updatedBy: admin.session.globalName || 'Dowództwo',
      };
      await writeJson(BATTLE_STATE_KEY, state);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ state });
    }

    if (body.action !== 'battle-report') {
      return res.status(400).json({ error: 'Nieznana operacja zespołu.' });
    }
    const admin = requireAdmin(req, res, 'canManageTeam');
    if (!admin) return;
    const text = typeof body.text === 'string' ? body.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 800) : '';
    if (text.length < 3) return res.status(400).json({ error: 'Meldunek musi mieć co najmniej 3 znaki.' });
    const messages = await readJson(BATTLE_REPORTS_KEY, []);
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      type: 'battle',
      unit: typeof body.unit === 'string' ? body.unit.trim().slice(0, 100) : 'Dowództwo',
      text,
      author: admin.session.globalName || 'Dowództwo',
      createdAt: new Date().toISOString(),
    };
    await writeJson(BATTLE_REPORTS_KEY, [...messages.slice(-99), message]);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json({ message });
  } catch (error) {
    if (error.code === 'STORE_NOT_CONFIGURED') {
      return isBattleChannel || req.method === 'POST'
        ? res.status(503).json({ error: 'Meldunki starcia wymagają skonfigurowanego Upstash Redis.' })
        : res.status(200).json({ team: [] });
    }
    console.error('Błąd publicznej ekipy:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać ekipy.' });
  }
};
