const crypto = require('crypto');
const { requireAdmin } = require('../lib/admin-auth');
const { addPublicRadioMessage, addRadioMessage, readRadioMessages } = require('../lib/radio-store');

const RESERVED_CALLSIGN = 'Komunikat Nadawczy Redwood Radio Szyfrowane';
const RADIO_CALLSIGN = RESERVED_CALLSIGN;

function normalizeCallSign(value) {
  return value.toLocaleLowerCase('pl-PL').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]/g, '');
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body || {};
}

function clean(value, maxLength, multiline = false) {
  if (typeof value !== 'string') return '';
  const controlChars = multiline
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  return value.replace(controlChars, '').trim().slice(0, maxLength);
}

function getRateLimitKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = req.headers['x-real-ip'] || (forwardedFor && forwardedFor.split(',')[0].trim()) || 'unknown';
  const hash = crypto.createHash('sha256').update(ip).digest('hex');
  return `grayfall:radio:rate:${hash}`;
}

function makeId() {
  return `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ messages: await readRadioMessages() });
    }

    const body = parseBody(req.body);
    if (body.action === 'broadcast') {
      const admin = requireAdmin(req, res, 'canManageTeam');
      if (!admin) return;

      const text = clean(body.text, 1000, true);
      if (text.length < 2) return res.status(400).json({ error: 'Komunikat musi mieć co najmniej 2 znaki.' });
      const messages = await readRadioMessages();
      const replyTo = typeof body.replyTo === 'string' ? body.replyTo : '';
      const target = replyTo ? messages.find((message) => message.id === replyTo && message.type === 'listener') : null;
      if (replyTo && !target) return res.status(404).json({ error: 'Nie znaleziono transmisji, na którą odpowiadasz.' });

      const message = {
        id: makeId(),
        type: 'operator',
        callSign: RADIO_CALLSIGN,
        text,
        replyTo: target?.id || null,
        replyToCallSign: target?.callSign || null,
        createdAt: new Date().toISOString(),
      };
      await addRadioMessage(message);
      return res.status(201).json({ message });
    }

    const submittedCallSign = clean(body.callSign, 100).replace(/\s+/g, ' ');
    const text = clean(body.text, 500, true);
    if (text.length < 2) return res.status(400).json({ error: 'Wiadomość musi mieć co najmniej 2 znaki.' });
    if (normalizeCallSign(submittedCallSign) === normalizeCallSign(RESERVED_CALLSIGN)) {
      return res.status(400).json({ error: 'Ten znak wywoławczy jest zarezerwowany dla stacji.' });
    }
    const callSign = submittedCallSign.slice(0, 32) || 'Nieznany sygnał';

    const message = {
      id: makeId(),
      type: 'listener',
      callSign,
      text,
      createdAt: new Date().toISOString(),
    };
    const result = await addPublicRadioMessage(message, getRateLimitKey(req));
    if (!result.accepted) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({ error: 'Nadajesz zbyt często. Odczekaj chwilę przed kolejną transmisją.', retryAfter: result.retryAfter });
    }

    return res.status(201).json({ message });
  } catch (error) {
    console.error('Błąd czatu radiowego:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({
      error: error.code === 'STORE_NOT_CONFIGURED'
        ? 'Czat radiowy wymaga skonfigurowanego Upstash Redis.'
        : 'Nie udało się wysłać wiadomości na radio.',
    });
  }
};