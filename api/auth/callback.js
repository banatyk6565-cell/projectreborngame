const { sign } = require('../../lib/session');
const { serializeCookie } = require('../../lib/cookies');

module.exports = async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    res.writeHead(302, { Location: '/?login=error' });
    return res.end();
  }
  if (!code) {
    return res.status(400).send('Brak kodu autoryzacji (code) w zapytaniu.');
  }

  const required = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'SESSION_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Brakuje zmiennych środowiskowych:', missing.join(', '));
    return res.status(500).send('Błąd konfiguracji serwera. Sprawdź zmienne środowiskowe.');
  }

  try {
    // 1) Wymiana kodu na access token (client_secret zostaje bezpiecznie po stronie serwera)
    const tokenParams = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
    });

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });

    if (!tokenRes.ok) {
      console.error('Wymiana tokenu nieudana:', await tokenRes.text());
      res.writeHead(302, { Location: '/?login=error' });
      return res.end();
    }
    const tokenData = await tokenRes.json();

    // 2) Pobranie danych zalogowanego użytkownika
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      console.error('Pobranie użytkownika nieudane:', await userRes.text());
      res.writeHead(302, { Location: '/?login=error' });
      return res.end();
    }
    const user = await userRes.json();

    const avatarUrl = user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number(user.discriminator || 0) % 5}.png`;

    // 3) Podpisany, bezstanowy "session token" trzymany w httpOnly cookie (7 dni)
    const sessionPayload = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: avatarUrl,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    };
    const sessionToken = sign(sessionPayload, process.env.SESSION_SECRET);

    res.setHeader(
      'Set-Cookie',
      serializeCookie('grayfall_session', sessionToken, {
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
      })
    );

    res.writeHead(302, { Location: '/' });
    res.end();
  } catch (err) {
    console.error('Błąd podczas logowania przez Discord:', err);
    res.writeHead(302, { Location: '/?login=error' });
    res.end();
  }
};
