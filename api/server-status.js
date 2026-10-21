const net = require('net');

function buildPacket(id, type, body) {
  const payload = Buffer.from(`${body}\0\0`, 'utf8');
  const packet = Buffer.alloc(4 + 4 + 4 + payload.length);
  packet.writeInt32LE(packet.length - 4, 0);
  packet.writeInt32LE(id, 4);
  packet.writeInt32LE(type, 8);
  payload.copy(packet, 12);
  return packet;
}

function decodeRconResponse(raw) {
  if (!raw || raw.length < 12) return '';
  const size = raw.readInt32LE(0);
  const requestId = raw.readInt32LE(4);
  const type = raw.readInt32LE(8);
  if (size <= 0 || type === 0) return '';
  const body = raw.subarray(12, raw.length - 2);
  const text = body.toString('utf8').replace(/\u0000+$/g, '');
  return text || '';
}

function makeFallbackStatus() {
  return {
    online: false,
    serverName: 'Grayfall',
    map: 'Serwer offline',
    version: 'Weryfikacja w toku',
    playersOnline: 0,
    maxPlayers: 0,
    uptime: 'Brak danych',
    maintenance: false,
    restartScheduled: false,
    players: [],
    stats: {
      zombiesKilled: 0,
      deaths: 0,
      longestSessionHours: 0,
      topActivity: 'Brak danych',
      monthly: 'W kolejce',
    },
    lastUpdated: new Date().toISOString(),
    source: 'fallback',
  };
}

function parseStatusResponse(text) {
  if (!text) return null;
  const status = { online: true, players: [] };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const playersLine = lines.find((line) => /players?/i.test(line) || /player/i.test(line));
  if (playersLine) {
    const match = playersLine.match(/(\d+)\s*\/\s*(\d+)/i);
    if (match) {
      status.playersOnline = Number(match[1]);
      status.maxPlayers = Number(match[2]);
    }
  }

  const mapLine = lines.find((line) => /map/i.test(line) || /world/i.test(line));
  if (mapLine) {
    const match = mapLine.match(/(?::|\s)([A-Za-z0-9_\- ]{2,})$/i);
    status.map = match ? match[1].trim() : mapLine;
  }

  const validPlayers = lines.filter((line) => /\d+\s+\S+/.test(line));
  status.players = validPlayers.slice(0, 20).map((line, index) => ({
    id: `slot-${index}`,
    name: line.replace(/^\d+\s+/, '').split(/\s{2,}/)[0] || 'Gracz',
    time: 'Brak danych',
    status: 'online',
  }));

  status.serverName = 'Grayfall';
  status.version = 'Project Zomboid';
  status.uptime = 'Weryfikacja';
  status.maintenance = false;
  status.restartScheduled = false;
  status.lastUpdated = new Date().toISOString();
  status.source = 'rcon';
  return status;
}

function tryRconStatus(host, port, password) {
  return new Promise((resolve) => {
    if (!host || !password) {
      resolve(null);
      return;
    }

    const commands = ['status', 'serverinfo', 'showplayers'];
    const results = [];

    let index = 0;

    const attemptNext = () => {
      if (index >= commands.length) {
        resolve(results.find(Boolean) || null);
        return;
      }

      const command = commands[index];
      index += 1;
      const socket = new net.Socket();
      let settled = false;
      let chunks = [];

      const fail = () => {
        if (settled) return;
        settled = true;
        attemptNext();
      };

      socket.setTimeout(2000);
      socket.once('connect', () => {
        const authPacket = buildPacket(0, 3, password);
        socket.write(authPacket);
        setTimeout(() => {
          const cmdPacket = buildPacket(1, 2, command);
          socket.write(cmdPacket);
        }, 120);
      });

      socket.on('data', (chunk) => {
        if (settled) return;
        chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const decoded = decodeRconResponse(body);
        if (decoded) {
          settled = true;
          results.push(decoded);
          socket.destroy();
          resolve(parseStatusResponse(decoded) || { online: false, source: 'rcon' });
        }
      });

      socket.on('timeout', fail);
      socket.on('error', fail);
      socket.on('close', () => {
        if (!settled) fail();
      });

      socket.connect(port, host);
    };

    attemptNext();
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  try {
    const host = process.env.PROJECT_ZOMBOID_SERVER_HOST || process.env.PROJECT_ZOMBOID_HOST || '5.39.69.222';
    const port = Number(process.env.PROJECT_ZOMBOID_RCON_PORT || 27001);
    const password = process.env.PROJECT_ZOMBOID_RCON_PASSWORD;

    const status = await tryRconStatus(host, port, password);
    if (status && status.online) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(status);
    }

    const fallback = makeFallbackStatus();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ...fallback,
      serverName: 'Grayfall',
      map: 'Serwer offline / brak synchronizacji',
      version: 'Weryfikacja po stronie serwera',
      source: 'fallback',
      message: 'Połączenie z serwerem nie jest aktywne w tej chwili. Status będzie odświeżany automatycznie po ustaleniu połączenia RCON.',
    });
  } catch (error) {
    console.error('Błąd pobierania statusu serwera:', error);
    return res.status(200).json({
      ...makeFallbackStatus(),
      source: 'fallback',
      message: 'Serwer nie odpowiada; to nie jest błąd strony, tylko brak aktywnego połączenia do backendu projektu.',
    });
  }
};
