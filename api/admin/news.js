const { requireAdmin } = require('./_auth');
const { readJson, writeJson } = require('../../lib/admin-store');

const NEWS_KEY = 'grayfall:admin:news';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canManageNews');
  if (!result) return;

  try {
    const news = await readJson(NEWS_KEY, []);

    if (req.method === 'GET') return res.status(200).json({ news });

    if (!['POST', 'PUT', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, PUT, DELETE');
      return res.status(405).json({ error: 'Metoda niedozwolona.' });
    }

    if (req.method === 'POST') {
      const { title, content, important, publishedAt } = req.body || {};
      if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Tytuł i treść są wymagane.' });
      const item = {
        id: makeId(),
        title: title.trim().slice(0, 120),
        content: content.trim().slice(0, 4000),
        important: !!important,
        publishedAt: publishedAt || new Date().toISOString(),
        author: result.session.globalName,
        authorId: result.session.id,
      };
      await writeJson(NEWS_KEY, [item, ...news]);
      return res.status(201).json({ item });
    }

    const id = req.query.id;
    const index = news.findIndex((item) => item.id === id);
    if (index < 0) return res.status(404).json({ error: 'Nie znaleziono newsa.' });

    if (req.method === 'DELETE') {
      news.splice(index, 1);
      await writeJson(NEWS_KEY, news);
      return res.status(200).json({ ok: true });
    }

    const { title, content, important, publishedAt } = req.body || {};
    if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: 'Tytuł i treść są wymagane.' });
    news[index] = {
      ...news[index],
      title: title.trim().slice(0, 120),
      content: content.trim().slice(0, 4000),
      important: !!important,
      publishedAt: publishedAt || news[index].publishedAt,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(NEWS_KEY, news);
    return res.status(200).json({ item: news[index] });
  } catch (error) {
    console.error('Błąd panelu newsów:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({ error: error.message });
  }
};
