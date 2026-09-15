const { requireAdmin } = require('./_auth');
const { readJson, writeJson } = require('../../lib/admin-store');

const CHAT_KEY = 'grayfall:admin:chat';

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canUseChat');
  if (!result) return;

  try {
    const messages = await readJson(CHAT_KEY, []);
    if (req.method === 'GET') return res.status(200).json({ messages: messages.slice(-100) });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Metoda niedozwolona.' });
    }

    const text = req.body?.text?.trim();
    if (!text) return res.status(400).json({ error: 'Wiadomość nie może być pusta.' });
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text: text.slice(0, 1000),
      author: result.session.globalName,
      authorId: result.session.id,
      avatar: result.session.avatar,
      createdAt: new Date().toISOString(),
    };
    await writeJson(CHAT_KEY, [...messages.slice(-99), message]);
    return res.status(201).json({ message });
  } catch (error) {
    console.error('Błąd czatu administracyjnego:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({ error: error.message });
  }
};
