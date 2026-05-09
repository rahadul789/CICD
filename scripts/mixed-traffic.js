import { io } from 'socket.io-client';

const config = {
  url: process.env.MIXED_TRAFFIC_URL || 'http://localhost:3000',
  durationSeconds: Number(process.env.MIXED_TRAFFIC_DURATION_SECONDS || 120),
  httpRequestsPerSecond: Number(process.env.MIXED_TRAFFIC_HTTP_RPS || 30),
  httpTimeoutMs: Number(process.env.MIXED_TRAFFIC_HTTP_TIMEOUT_MS || 5000),
  socketClients: Number(process.env.MIXED_TRAFFIC_SOCKET_CLIENTS || 50),
  socketMessageIntervalMs: Number(
    process.env.MIXED_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS || 1000
  ),
  socketConnectStaggerMs: Number(
    process.env.MIXED_TRAFFIC_SOCKET_CONNECT_STAGGER_MS || 40
  ),
  socketAckTimeoutMs: Number(process.env.MIXED_TRAFFIC_SOCKET_ACK_TIMEOUT_MS || 5000),
  transports: (process.env.MIXED_TRAFFIC_SOCKET_TRANSPORTS || 'websocket,polling')
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean)
};

const stats = {
  http: {
    started: 0,
    ok: 0,
    failed: 0,
    byScenario: {},
    statusCodes: {}
  },
  socket: {
    connected: 0,
    welcomed: 0,
    disconnected: 0,
    sent: 0,
    ackOk: 0,
    ackFailed: 0,
    broadcastsReceived: 0,
    socketErrors: 0,
    connectionErrors: 0
  }
};

const sockets = [];
const pendingHttpRequests = [];
const startedAt = Date.now();
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path) {
  return `${config.url.replace(/\/$/, '')}${path}`;
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function createJsonPostOptions(body) {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };
}

const httpScenarios = [
  {
    name: 'health-live',
    weight: 10,
    request: () => fetchWithTimeout(buildUrl('/health/live'))
  },
  {
    name: 'home',
    weight: 4,
    request: () => fetchWithTimeout(buildUrl('/'))
  },
  {
    name: 'health-ready',
    weight: 4,
    request: () => fetchWithTimeout(buildUrl('/health/ready'))
  },
  {
    name: 'messages-list',
    weight: 8,
    request: () => fetchWithTimeout(buildUrl('/api/messages?limit=20'))
  },
  {
    name: 'metrics',
    weight: 2,
    request: () => fetchWithTimeout(buildUrl('/metrics'))
  },
  {
    name: 'messages-create',
    weight: 2,
    request: (requestNumber) =>
      fetchWithTimeout(
        buildUrl('/api/messages'),
        createJsonPostOptions({
          author: 'mixed-http-bot',
          content: `Mixed HTTP fake traffic message ${requestNumber}`
        })
      )
  }
];

const totalHttpScenarioWeight = httpScenarios.reduce(
  (sum, scenario) => sum + scenario.weight,
  0
);

for (const scenario of httpScenarios) {
  stats.http.byScenario[scenario.name] = {
    started: 0,
    ok: 0,
    failed: 0
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.httpTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function chooseHttpScenario() {
  let randomWeight = Math.random() * totalHttpScenarioWeight;

  for (const scenario of httpScenarios) {
    randomWeight -= scenario.weight;

    if (randomWeight <= 0) {
      return scenario;
    }
  }

  return httpScenarios.at(-1);
}

async function sendHttpRequest(requestNumber) {
  const scenario = chooseHttpScenario();
  stats.http.started += 1;
  stats.http.byScenario[scenario.name].started += 1;

  try {
    const response = await scenario.request(requestNumber);
    increment(stats.http.statusCodes, response.status);

    if (response.ok) {
      stats.http.ok += 1;
      stats.http.byScenario[scenario.name].ok += 1;
    } else {
      stats.http.failed += 1;
      stats.http.byScenario[scenario.name].failed += 1;
    }

    await response.arrayBuffer();
  } catch (error) {
    stats.http.failed += 1;
    stats.http.byScenario[scenario.name].failed += 1;
    console.warn(`http ${scenario.name} failed: ${error.message}`);
  }
}

async function runHttpTraffic(stopAt) {
  const intervalMs = 1000 / config.httpRequestsPerSecond;
  let nextRequestAt = Date.now();
  let requestNumber = 0;

  while (!shuttingDown && Date.now() < stopAt) {
    requestNumber += 1;
    const request = sendHttpRequest(requestNumber);
    pendingHttpRequests.push(request);

    nextRequestAt += intervalMs;
    await sleep(Math.max(0, nextRequestAt - Date.now()));
  }

  await Promise.allSettled(pendingHttpRequests);
}

function createSocket(clientNumber) {
  const socket = io(config.url, {
    transports: config.transports,
    reconnection: false,
    timeout: config.socketAckTimeoutMs
  });

  socket.on('connect', () => {
    stats.socket.connected += 1;
    console.log(`socket-client-${clientNumber} connected as ${socket.id}`);
  });

  socket.on('server:welcome', () => {
    stats.socket.welcomed += 1;
  });

  socket.on('message:new', () => {
    stats.socket.broadcastsReceived += 1;
  });

  socket.on('message:error', (error) => {
    stats.socket.socketErrors += 1;
    console.warn(`socket-client-${clientNumber} message:error`, error);
  });

  socket.on('connect_error', (error) => {
    stats.socket.connectionErrors += 1;
    console.warn(`socket-client-${clientNumber} connect_error: ${error.message}`);
  });

  socket.on('disconnect', (reason) => {
    stats.socket.disconnected += 1;
    console.log(`socket-client-${clientNumber} disconnected: ${reason}`);
  });

  sockets.push(socket);
  return socket;
}

async function waitForConnection(socket, clientNumber) {
  if (socket.connected) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      console.warn(`socket-client-${clientNumber} connection timed out`);
      resolve(false);
    }, config.socketAckTimeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
    }

    function onConnect() {
      cleanup();
      resolve(true);
    }

    function onConnectError() {
      cleanup();
      resolve(false);
    }

    socket.once('connect', onConnect);
    socket.once('connect_error', onConnectError);
  });
}

async function connectSocketClient(clientNumber) {
  const socket = createSocket(clientNumber);
  const connected = await waitForConnection(socket, clientNumber);

  if (!connected) {
    socket.disconnect();
    return null;
  }

  return {
    clientNumber,
    socket
  };
}

async function sendSocketMessage(socket, clientNumber, messageNumber) {
  const payload = {
    author: `mixed-socket-user-${clientNumber}`,
    content: `Mixed Socket.IO message ${messageNumber} from client ${clientNumber}`
  };

  return new Promise((resolve) => {
    socket
      .timeout(config.socketAckTimeoutMs)
      .emit('message:send', payload, (error, response) => {
        stats.socket.sent += 1;

        if (error || !response?.ok) {
          stats.socket.ackFailed += 1;
          console.warn(
            `socket-client-${clientNumber} message-${messageNumber} failed: ${
              error?.message || response?.error?.message || 'unknown error'
            }`
          );
          resolve(false);
          return;
        }

        stats.socket.ackOk += 1;
        resolve(true);
      });
  });
}

async function runSocketMessageLoop(client, stopAt) {
  let messageNumber = 0;

  while (!shuttingDown && client.socket.connected && Date.now() < stopAt) {
    messageNumber += 1;
    await sendSocketMessage(client.socket, client.clientNumber, messageNumber);
    await sleep(config.socketMessageIntervalMs);
  }
}

async function connectSocketClients() {
  const clientConnections = [];

  for (let clientNumber = 1; clientNumber <= config.socketClients; clientNumber += 1) {
    clientConnections.push(connectSocketClient(clientNumber));
    await sleep(config.socketConnectStaggerMs);
  }

  const clients = (await Promise.all(clientConnections)).filter(Boolean);
  console.log(`Connected socket clients: ${clients.length}/${config.socketClients}`);

  return clients;
}

async function runProgressReporter(stopAt) {
  while (!shuttingDown && Date.now() < stopAt) {
    await sleep(10000);
    printProgress();
  }
}

function printProgress() {
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `progress elapsed=${elapsedSeconds}s httpStarted=${stats.http.started} ` +
      `httpOk=${stats.http.ok} httpFailed=${stats.http.failed} ` +
      `socketConnected=${stats.socket.connected} socketSent=${stats.socket.sent} ` +
      `socketAckOk=${stats.socket.ackOk} socketAckFailed=${stats.socket.ackFailed}`
  );
}

function printSummary() {
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\nMixed traffic summary');
  console.log(`durationSeconds=${durationSeconds}`);
  console.log(`url=${config.url}`);
  console.log(`targetDurationSeconds=${config.durationSeconds}`);
  console.log(`httpRequestsPerSecond=${config.httpRequestsPerSecond}`);
  console.log(`socketClients=${config.socketClients}`);
  console.log(`socketMessageIntervalMs=${config.socketMessageIntervalMs}`);
  console.log('\nHTTP');
  console.log(`started=${stats.http.started}`);
  console.log(`ok=${stats.http.ok}`);
  console.log(`failed=${stats.http.failed}`);
  console.log(`statusCodes=${JSON.stringify(stats.http.statusCodes)}`);
  console.log(`byScenario=${JSON.stringify(stats.http.byScenario, null, 2)}`);
  console.log('\nSocket.IO');
  console.log(`connected=${stats.socket.connected}`);
  console.log(`welcomed=${stats.socket.welcomed}`);
  console.log(`sent=${stats.socket.sent}`);
  console.log(`ackOk=${stats.socket.ackOk}`);
  console.log(`ackFailed=${stats.socket.ackFailed}`);
  console.log(`broadcastsReceived=${stats.socket.broadcastsReceived}`);
  console.log(`socketErrors=${stats.socket.socketErrors}`);
  console.log(`connectionErrors=${stats.socket.connectionErrors}`);
  console.log(`disconnected=${stats.socket.disconnected}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const socket of sockets) {
    socket.disconnect();
  }

  await Promise.allSettled(pendingHttpRequests);
  await sleep(500);
  printSummary();
  process.exit(exitCode);
}

async function main() {
  console.log('Starting mixed fake traffic');
  console.log(JSON.stringify(config, null, 2));

  const clients = await connectSocketClients();
  const stopAt = Date.now() + config.durationSeconds * 1000;

  console.log(
    `Running ${config.durationSeconds}s scenario: ` +
      `${clients.length} socket clients, ${config.httpRequestsPerSecond}/s HTTP requests`
  );

  const socketRuns = clients.map((client) => runSocketMessageLoop(client, stopAt));

  await Promise.all([runHttpTraffic(stopAt), runProgressReporter(stopAt), ...socketRuns]);

  await shutdown(0);
}

process.on('SIGINT', () => {
  console.log('\nStopping mixed traffic...');
  void shutdown(130);
});

process.on('SIGTERM', () => {
  console.log('\nStopping mixed traffic...');
  void shutdown(143);
});

main().catch((error) => {
  console.error('Mixed traffic failed', error);
  void shutdown(1);
});
