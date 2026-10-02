const { redis } = require('./admin-store');

const RADIO_KEY = 'grayfall:radio:messages';
const RADIO_STATUS_KEY = 'grayfall:radio:status';

const APPEND_PUBLIC_SCRIPT = `
local status = redis.call('GET', KEYS[3]) or 'offline'
if status ~= ARGV[4] then return {'offline', '0'} end

local current = tonumber(redis.call('GET', KEYS[2]) or '0')
if current >= tonumber(ARGV[2]) then
  local ttl = redis.call('TTL', KEYS[2])
  return {'limited', tostring(ttl)}
end

local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3])) end
redis.call('RPUSH', KEYS[1], ARGV[1])
redis.call('LTRIM', KEYS[1], -100, -1)
return {'accepted', tostring(count)}
`;

async function readRadioMessages() {
  const entries = await redis(['LRANGE', RADIO_KEY, 0, -1]);
  return Array.isArray(entries) ? entries.map((entry) => JSON.parse(entry)) : [];
}

async function readRadioStatus() {
  return (await redis(['GET', RADIO_STATUS_KEY])) === 'live' ? 'live' : 'offline';
}

async function writeRadioStatus(status) {
  await redis(['SET', RADIO_STATUS_KEY, status]);
  return status;
}

async function addPublicRadioMessage(message, rateLimitKey) {
  const result = await redis([
    'EVAL', APPEND_PUBLIC_SCRIPT, '3', RADIO_KEY, rateLimitKey, RADIO_STATUS_KEY,
    JSON.stringify(message), '3', '300', 'live',
  ]);
  return {
    accepted: result[0] === 'accepted',
    offline: result[0] === 'offline',
    retryAfter: Math.max(1, Number(result[1]) || 300),
  };
}

async function addRadioMessage(message) {
  await redis(['RPUSH', RADIO_KEY, JSON.stringify(message)]);
  await redis(['LTRIM', RADIO_KEY, -100, -1]);
}

module.exports = { addPublicRadioMessage, addRadioMessage, readRadioMessages, readRadioStatus, writeRadioStatus };