const { readJson } = require('../lib/admin-store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metoda niedozwolona.' });
  try {
    const news = await readJson('grayfall:admin:news', []);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    return res.status(200).json({ news });
  } catch (error) {
    if (error.code === 'STORE_NOT_CONFIGURED') return res.status(200).json({ news: [] });
    console.error('Błąd publicznych newsów:', error);
    return res.status(500).json({ error: 'Nie udało się pobrać newsów.' });
  }
};
