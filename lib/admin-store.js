const STORE_URL = process.env.UPSTASH_REDIS_REST_URL;
const STORE_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  if (!STORE_URL || !STORE_TOKEN) {
    const error = new Error('Brak konfiguracji magazynu administracyjnego.');
    error.code = 'STORE_NOT_CONFIGURED';
    throw error;
  }

  const response = await fetch(STORE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STORE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) throw new Error(`Magazyn danych zwrócił HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.result;
}

async function readJson(key, fallback) {
  const value = await redis(['GET', key]);
  return value ? JSON.parse(value) : fallback;
}

async function writeJson(key, value) {
  await redis(['SET', key, JSON.stringify(value)]);
  return value;
}

module.exports = { readJson, writeJson };
