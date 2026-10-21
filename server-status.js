const dgram = require('dgram');

const QUERY_TIMEOUT_MS = 2500;

function makeRequest(type, challenge = Buffer.alloc(4, 0xff)) {
  if (type === 'info') {
    return Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
      Buffer.from('Source Engine Query\0', 'ascii'),
      challenge,
    ]);
  }
  return Buffer.concat([
    Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55]),
    challenge,
  ]);
}

function sendQuery(socket, packet, host, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('QUERY_TIMEOUT')), QUERY_TIMEOUT_MS);
    const onMessage = (message) => {
      clearTimeout(timeout);
      socket.removeListener('message', onMessage);
      resolve(message);
    };
    socket.once('message', onMessage);
    socket.send(packet, port, host, (error) => {
      if (!error) return;
      clearTimeout(timeout);
      socket.removeListener('message', onMessage);
      reject(error);
    });
  });
}

async function queryWithChallenge(socket, type, host, port) {
  let response = await sendQuery(socket, makeRequest(type), host, port);
  if (response.length >= 9 && response.readUInt32LE(0) === 0xffffffff && response[4] === 0x41) {
    response = await sendQuery(socket, makeRequest(type, response.subarray(5, 9)), host, port);
  }
  if (response.length < 5 || response.readUInt32LE(0) !== 0xffffffff) {
    throw new Error('INVALID_QUERY_RESPONSE');
  }
  return response;
}

function readNullTerminatedString(buffer, state) {
  const start = state.offset;
  while (state.offset < buffer.length && buffer[state.offset] !== 0) state.offset += 1;
  if (state.offset >= buffer.length) throw new Error('INVALID_INFO_RESPONSE');
  const value = buffer.toString('utf8', start, state.offset);
  state.offset += 1;
  return value;
}

function parseInfo(response) {
  if (response[4] !== 0x49 || response.length < 6) throw new Error('INVALID_INFO_RESPONSE');
  const state = { offset: 6 };
  const name = readNullTerminatedString(response, state);
  const map = readNullTerminatedString(response, state);
  readNullTerminatedString(response, state);
  readNullTerminatedString(response, state);
  if (state.offset + 7 > response.length) throw new Error('INVALID_INFO_RESPONSE');
  state.offset += 2;
  const playersOnline = response[state.offset++];
  const maxPlayers = response[state.offset++];
  state.offset += 3;
  const visibility = response[state.offset++];
  state.offset += 1;
  const protocolVersion = readNullTerminatedString(response, state);
  let gameVersion = protocolVersion;

  const versionMatch = response.toString('utf8').match(/VERSION:([0-9.]+)/i);
  if (versionMatch) gameVersion = versionMatch[1];

  return {
    serverName: name || 'Grayfall',
    map: map || 'Nieznana mapa',
    playersOnline,
    maxPlayers,
    version: gameVersion || 'Nieznana',
    visibility,
  };
}

function parsePlayers(response) {
  if (response[4] !== 0x44 || response.length < 6) return [];
  const count = response[5];
  const players = [];
  const state = { offset: 6 };
  for (let index = 0; index < count; index += 1) {
    const name = readNullTerminatedString(response, state);
    if (state.offset + 8 > response.length) break;
    const score = response.readInt32LE(state.offset);
    state.offset += 4;
    const duration = response.readFloatLE(state.offset);
    state.offset += 4;
    players.push({
      id: `player-${index}`,
      name: name || 'Gracz',
      score,
      time: `${Math.floor(duration / 3600)} h ${Math.floor((duration % 3600) / 60)} min`,
      status: 'online',
    });
  }
  return players;
}

async function getServerStatus(host, port) {
  const socket = dgram.createSocket('udp4');
  try {
    const startedAt = Date.now();
    const infoResponse = await queryWithChallenge(socket, 'info', host, port);
    const ping = Date.now() - startedAt;
    const info = parseInfo(infoResponse);
    let players = [];
    try {
      players = parsePlayers(await queryWithChallenge(socket, 'players', host, port));
    } catch (error) {
      if (error.message !== 'QUERY_TIMEOUT') throw error;
    }
    return {
      online: true,
      ...info,
      ping,
      uptime: null,
      maintenance: null,
      restartScheduled: null,
      playersOnline: info.playersOnline,
      players,
      stats: {
        zombiesKilled: null,
        deaths: null,
        longestSessionHours: null,
        topActivity: null,
        monthly: null,
      },
      lastUpdated: new Date().toISOString(),
      source: 'steam-query',
    };
  } finally {
    socket.close();
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Metoda niedozwolona.' });
  }

  const host = process.env.PROJECT_ZOMBOID_SERVER_HOST || '5.39.69.222';
  const port = Number(process.env.PROJECT_ZOMBOID_SERVER_PORT || 27000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return res.status(500).json({ error: 'Nieprawidłowy port query serwera.' });
  }

  try {
    const status = await getServerStatus(host, port);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(status);
  } catch (error) {
    if (error.message !== 'QUERY_TIMEOUT') {
      console.error('Błąd odczytu publicznego query Project Zomboid:', error);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      online: null,
      serverName: 'Grayfall',
      map: null,
      version: null,
      playersOnline: null,
      maxPlayers: null,
      ping: null,
      uptime: null,
      maintenance: null,
      restartScheduled: null,
      players: [],
      stats: {
        zombiesKilled: null,
        deaths: null,
        longestSessionHours: null,
        topActivity: null,
        monthly: null,
      },
      lastUpdated: new Date().toISOString(),
      source: 'unavailable',
      message: 'Nie udało się odczytać publicznego query serwera. To nie potwierdza, że serwer jest offline.',
    });
  }
};
