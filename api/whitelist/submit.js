const { verify } = require('../../lib/session');
const { parseCookies } = require('../../lib/cookies');

const MAX_SHORT = 150;   // np. nick w grze, skąd o nas wiesz
const MAX_LONG = 800;    // np. doświadczenie, uzasadnienie

function clean(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maxLen);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Metoda niedozwolona.' });
  }

  // 1) Wymagamy zalogowania - tożsamość bierzemy z sesji, NIE z tego co przyśle front-end,
  //    żeby nikt nie mógł podszyć się pod inny nick/avatar.
  const cookies = parseCookies(req.headers.cookie);
  const session = verify(cookies.grayfall_session, process.env.SESSION_SECRET);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'Musisz być zalogowany przez Discord, żeby wysłać zgłoszenie.' });
  }

  if (!process.env.DISCORD_WEBHOOK_URL) {
    console.error('Brak zmiennej środowiskowej DISCORD_WEBHOOK_URL');
    return res.status(500).json({ ok: false, error: 'Formularz nie jest jeszcze skonfigurowany. Spróbuj później.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  const gameNick = clean(body.gameNick, MAX_SHORT);
  const age = clean(body.age, 10);
  const experience = clean(body.experience, MAX_LONG);
  const reason = clean(body.reason, MAX_LONG);
  const source = clean(body.source, MAX_SHORT);

  if (!gameNick || !age || !reason) {
    return res.status(400).json({ ok: false, error: 'Uzupełnij wymagane pola: nick w grze, wiek i uzasadnienie.' });
  }
  if (reason.length < 15) {
    return res.status(400).json({ ok: false, error: 'Uzasadnienie jest za krótkie - napisz chociaż kilka zdań.' });
  }

  const payload = {
    username: 'Project Grayfall — Zgłoszenia',
    content: `📋 Nowe zgłoszenie na whitelistę od <@${session.id}>`,
    allowed_mentions: { parse: ['users'] },
    embeds: [
      {
        title: 'Zgłoszenie na Whitelistę',
        color: 0xc53030,
        thumbnail: { url: session.avatar },
        fields: [
          { name: 'Discord', value: `${session.globalName} (<@${session.id}>)`, inline: true },
          { name: 'Nick w grze', value: gameNick, inline: true },
          { name: 'Wiek', value: age, inline: true },
          { name: 'Doświadczenie z Project Zomboid', value: experience || 'nie podano' },
          { name: 'Dlaczego chce dołączyć?', value: reason },
          { name: 'Skąd o nas wie?', value: source || 'nie podano' },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const webhookRes = await fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!webhookRes.ok) {
      console.error('Webhook Discord odrzucił wiadomość:', webhookRes.status, await webhookRes.text());
      return res.status(502).json({ ok: false, error: 'Nie udało się wysłać zgłoszenia. Spróbuj ponownie za chwilę.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Błąd wysyłania zgłoszenia na whitelistę:', err);
    return res.status(500).json({ ok: false, error: 'Wystąpił nieoczekiwany błąd. Spróbuj ponownie.' });
  }
};
