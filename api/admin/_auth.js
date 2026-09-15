const { verify } = require('../../lib/session');
const { parseCookies } = require('../../lib/cookies');
const { getAdminAccess } = require('../../lib/admin');

function requireAdmin(req, res, permission) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.grayfall_session, process.env.SESSION_SECRET);
  const access = getAdminAccess(session?.roles || []);

  if (!session || !access[permission]) {
    res.status(403).json({ error: 'Brak uprawnień.' });
    return null;
  }

  return { session, access };
}

module.exports = { requireAdmin };
