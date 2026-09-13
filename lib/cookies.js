function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      out[key] = decodeURIComponent(val);
    }
  });
  return out;
}

function serializeCookie(name, value, opts = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`;
  str += `; Path=${opts.path || '/'}`;
  if (opts.httpOnly) str += '; HttpOnly';
  if (opts.secure) str += '; Secure';
  str += `; SameSite=${opts.sameSite || 'Lax'}`;
  return str;
}

module.exports = { parseCookies, serializeCookie };
