const crypto = require('crypto');
const { requireAdmin } = require('./_auth');
const { addRadioMessage, readRadioMessages, readRadioStatus, writeRadioStatus } = require('../../lib/radio-store');

const RADIO_CALLSIGN = 'Komunikat Radiowy 87.4 MHz — Region Zamknięty Grayfall';

function makeId() {
  return `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
}

module.exports = async function handler(req, res) {
  const result = requireAdmin(req, res, 'canManageTeam');
  if (!result) return;
  res.setHeader('Cache-Control', 'no-store');

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    if (req.method === 'GET') {
      const [messages, status] = await Promise.all([readRadioMessages(), readRadioStatus()]);
      return res.status(200).json({ messages, status });
    }

    if (req.body?.action === 'set-status') {
      if (!['live', 'offline'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Nieprawidłowy status radia.' });
      }
      const status = await writeRadioStatus(req.body.status);
      return res.status(200).json({ status });
    }

    const text = typeof req.body?.text === 'string'
      ? req.body.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, 1000)
      : '';
    if (text.length < 2) return res.status(400).json({ error: 'Komunikat musi mieć co najmniej 2 znaki.' });

    const messages = await readRadioMessages();
    const replyTo = typeof req.body.replyTo === 'string' ? req.body.replyTo : '';
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
  } catch (error) {
    console.error('Błąd panelu radia Grayfall:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({
      error: error.code === 'STORE_NOT_CONFIGURED'
        ? 'Radio wymaga skonfigurowanego Upstash Redis.'
        : 'Nie udało się opublikować komunikatu radiowego.',
    });
  }
};