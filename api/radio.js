const crypto = require('crypto');
const { addPublicRadioMessage, readRadioMessages, readRadioStatus } = require('../lib/radio-store');

const RESERVED_CALLSIGN = 'Komunikat Radiowy 87.4 MHz — Region Zamknięty Grayfall';

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
      const status = await readRadioStatus();
      if (req.query?.statusOnly === '1') return res.status(200).json({ status });
      const messages = await readRadioMessages();
      return res.status(200).json({ messages, status });
    }

    const body = parseBody(req.body);
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
    if (result.offline) {
      return res.status(409).json({ error: 'Stacja jest offline. Spróbuj ponownie, gdy wróci na częstotliwość.' });
    }
    if (!result.accepted) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({ error: 'Nadajesz zbyt często. Odczekaj chwilę przed kolejną transmisją.', retryAfter: result.retryAfter });
    }

    return res.status(201).json({ message });
  } catch (error) {
    console.error('Błąd publicznego radia:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({
      error: error.code === 'STORE_NOT_CONFIGURED'
        ? 'Radio wymaga skonfigurowanego Upstash Redis.'
        : 'Nie udało się połączyć z radiem Grayfall.',
    });
  }
};