const crypto = require('crypto');
const { redis } = require('../lib/admin-store');

const REVEAL_KEY = 'grayfall:lore:reveal-at';
const REVEAL_VERSION_KEY = 'grayfall:lore:duration-version';
const REVEAL_PASSWORD = 'NEW_ERA';
const TIMER_DURATION_MS = 20 * 60 * 1000;
const TIMER_VERSION = '20261001-20m-v1';
const LOCK_DURATION_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const MIGRATE_TIMER_SCRIPT = `
local revealAt = redis.call('GET', KEYS[1])
if not revealAt then return '' end

local version = redis.call('GET', KEYS[2])
if version == ARGV[3] then return revealAt end

if tonumber(revealAt) > tonumber(ARGV[1]) then
  revealAt = tostring(tonumber(ARGV[1]) + tonumber(ARGV[2]))
  redis.call('SET', KEYS[1], revealAt)
end
redis.call('SET', KEYS[2], ARGV[3])
return revealAt
`;

const SUBMIT_SCRIPT = `
local now = tonumber(ARGV[1])
local blockedUntil = tonumber(redis.call('GET', KEYS[1]) or '0')
if blockedUntil > now then
  return {'locked', tostring(blockedUntil)}
end

if ARGV[2] == ARGV[3] then
  local revealAt = redis.call('GET', KEYS[3])
  if not revealAt then
    revealAt = tostring(now + tonumber(ARGV[4]))
    redis.call('SET', KEYS[3], revealAt)
    redis.call('SET', KEYS[4], ARGV[7])
    redis.call('DEL', KEYS[2])
    return {'started', revealAt}
  end
  redis.call('DEL', KEYS[2])
  return {'already_started', revealAt}
end

local attempts = redis.call('INCR', KEYS[2])
if attempts == 1 then redis.call('EXPIRE', KEYS[2], 1800) end
if attempts >= tonumber(ARGV[5]) then
  blockedUntil = now + tonumber(ARGV[6])
  redis.call('SET', KEYS[1], tostring(blockedUntil), 'PX', tonumber(ARGV[6]))
  redis.call('DEL', KEYS[2])
  return {'locked', tostring(blockedUntil)}
end
return {'invalid', tostring(attempts)}
`;

function getClientKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = req.headers['x-real-ip'] || (forwardedFor && forwardedFor.split(',')[0].trim()) || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

function parseBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch { return {}; }
  }
  return body || {};
}

async function sendLoreDiscordAlert() {
  const webhookUrl = process.env.DISCORD_LORE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('Brak zmiennej środowiskowej DISCORD_LORE_WEBHOOK_URL');
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        content: '@everyone',
        allowed_mentions: { parse: ['everyone'] },
        embeds: [{
          title: 'AKT DOKUMENTÓW: kryptonim Grayfall',
          description: 'Ktoś odgadł hasło i uruchomił odliczanie do ujawnienia lore Grayfall.',
          color: 0xc53030,
          timestamp: new Date().toISOString(),
        }],
      }),
    });

    if (!response.ok) {
      console.error('Webhook lore odrzucił wiadomość:', response.status, await response.text());
    }
    return response.ok;
  } catch (error) {
    console.error('Nie udało się wysłać alertu lore na Discorda:', error);
    return false;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  const clientKey = getClientKey(req);
  const blockedKey = `grayfall:lore:blocked:${clientKey}`;
  const attemptsKey = `grayfall:lore:attempts:${clientKey}`;

  try {
    await redis([
      'EVAL', MIGRATE_TIMER_SCRIPT, '2', REVEAL_KEY, REVEAL_VERSION_KEY,
      String(Date.now()), String(TIMER_DURATION_MS), TIMER_VERSION,
    ]);

    if (req.method === 'GET') {
      const [revealAt, blockedUntil] = await redis(['MGET', REVEAL_KEY, blockedKey]);
      return res.status(200).json({
        revealAt: revealAt ? Number(revealAt) : null,
        blockedUntil: blockedUntil ? Number(blockedUntil) : null,
      });
    }

    const password = parseBody(req.body).password;
    if (typeof password !== 'string' || password.length > 100) {
      return res.status(400).json({ error: 'Podaj hasło.' });
    }

    const now = Date.now();
    const result = await redis([
      'EVAL', SUBMIT_SCRIPT, '4', blockedKey, attemptsKey, REVEAL_KEY, REVEAL_VERSION_KEY,
      String(now), password, REVEAL_PASSWORD, String(TIMER_DURATION_MS),
      String(MAX_ATTEMPTS), String(LOCK_DURATION_MS), TIMER_VERSION,
    ]);
    const [status, value] = result;

    if (status === 'locked') {
      return res.status(429).json({ blockedUntil: Number(value) });
    }
    if (status === 'invalid') {
      return res.status(401).json({ error: 'Nieprawidłowe hasło.' });
    }
    if (status === 'started') {
      const notificationSent = await sendLoreDiscordAlert();
      return res.status(200).json({ revealAt: Number(value), notificationSent });
    }
    return res.status(200).json({ revealAt: Number(value) });
  } catch (error) {
    console.error('Błąd wydarzenia lore:', error);
    return res.status(error.code === 'STORE_NOT_CONFIGURED' ? 503 : 500).json({
      error: error.code === 'STORE_NOT_CONFIGURED'
        ? 'Licznik lore wymaga skonfigurowanego Upstash Redis.'
        : 'Nie udało się sprawdzić licznika. Spróbuj ponownie później.',
    });
  }
};