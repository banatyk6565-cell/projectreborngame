const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64').toString('utf8');
}

/** Podpisuje obiekt (payload) i zwraca ciąg "payload.podpis" do trzymania w ciasteczku. */
function sign(payloadObj, secret) {
  const payload = base64url(JSON.stringify(payloadObj));
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

/** Weryfikuje podpis i zwraca oryginalny obiekt, albo null jeśli nieprawidłowy/wygasły. */
function verify(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, hmac] = parts;

  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(hmac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(base64urlDecode(payload));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

module.exports = { sign, verify };
