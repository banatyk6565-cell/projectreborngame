const { serializeCookie } = require('../../lib/cookies');

module.exports = async function handler(req, res) {
  res.setHeader(
    'Set-Cookie',
    serializeCookie('grayfall_session', '', {
      maxAge: 0,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    })
  );
  res.writeHead(302, { Location: '/' });
  res.end();
};
