const { verify } = require('../lib/session');
const { parseCookies } = require('../lib/cookies');

module.exports = async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.grayfall_session, process.env.SESSION_SECRET);

  if (!session) {
    return res.status(200).json({ loggedIn: false });
  }

  res.status(200).json({
    loggedIn: true,
    user: {
      id: session.id,
      username: session.username,
      globalName: session.globalName,
      avatar: session.avatar,
      inGuild: !!session.inGuild,
      isWhitelisted: !!session.isWhitelisted,
    },
  });
};
