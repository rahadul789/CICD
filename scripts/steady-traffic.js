import { io } from 'socket.io-client';

const config = {
  url: process.env.STEADY_TRAFFIC_URL || 'http://localhost:3000',
  baseHttpRps: Number(process.env.STEADY_TRAFFIC_BASE_HTTP_RPS || 20),
  httpTimeoutMs: Number(process.env.STEADY_TRAFFIC_HTTP_TIMEOUT_MS || 5000),
  maxInFlightHttp: Number(process.env.STEADY_TRAFFIC_MAX_IN_FLIGHT_HTTP || 1000),
  socketClients: Number(process.env.STEADY_TRAFFIC_SOCKET_CLIENTS || 15),
  socketAckTimeoutMs: Number(process.env.STEADY_TRAFFIC_SOCKET_ACK_TIMEOUT_MS || 5000),
  socketMaintainIntervalMs: Number(
    process.env.STEADY_TRAFFIC_SOCKET_MAINTAIN_INTERVAL_MS || 2000
  ),
  dbMessagesPerBatch: Number(process.env.STEADY_TRAFFIC_DB_MESSAGES_PER_BATCH || 3),
  dbBatchIntervalMs: Number(process.env.STEADY_TRAFFIC_DB_BATCH_INTERVAL_MS || 5000),
  reportIntervalMs: Number(process.env.STEADY_TRAFFIC_REPORT_INTERVAL_MS || 10000),
  spikesEnabled: process.env.STEADY_TRAFFIC_SPIKES_ENABLED !== 'false',
  spikeMinGapSeconds: Number(process.env.STEADY_TRAFFIC_SPIKE_MIN_GAP_SECONDS || 30),
  spikeMaxGapSeconds: Number(process.env.STEADY_TRAFFIC_SPIKE_MAX_GAP_SECONDS || 90),
  spikeMinDurationSeconds: Number(
    process.env.STEADY_TRAFFIC_SPIKE_MIN_DURATION_SECONDS || 10
  ),
  spikeMaxDurationSeconds: Number(
    process.env.STEADY_TRAFFIC_SPIKE_MAX_DURATION_SECONDS || 25
  ),
  spikeMinExtraRps: Number(process.env.STEADY_TRAFFIC_SPIKE_MIN_EXTRA_RPS || 40),
  spikeMaxExtraRps: Number(process.env.STEADY_TRAFFIC_SPIKE_MAX_EXTRA_RPS || 100),
  transports: (process.env.STEADY_TRAFFIC_SOCKET_TRANSPORTS || 'websocket,polling')
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean)
};

const stats = {
  httpStarted: 0,
  httpOk: 0,
  httpFailed: 0,
  httpSkippedByInFlightLimit: 0,
  httpByScenario: {},
  statusCodes: {},
  socketConnectedTotal: 0,
  socketDisconnectedTotal: 0,
  socketConnectionErrors: 0,
  dbMessagesAttempted: 0,
  dbMessagesSaved: 0,
  dbMessagesFailed: 0,
  spikesStarted: 0
};

const sockets = new Map();
const inFlightHttp = new Set();
const startedAt = Date.now();

let shuttingDown = false;
let nextSocketClientNumber = 0;
let currentSpike = null;

const httpScenarios = [
  {
    name: 'health-live',
    weight: 9,
    request: () => fetchWithTimeout(buildUrl('/health/live'))
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
    name: 'home',
    weight: 4,
    request: () => fetchWithTimeout(buildUrl('/'))
  },
  {
    name: 'metrics',
    weight: 1,
    request: () => fetchWithTimeout(buildUrl('/metrics'))
  }
];

const totalScenarioWeight = httpScenarios.reduce(
  (sum, scenario) => sum + scenario.weight,
  0
);

for (const scenario of httpScenarios) {
  stats.httpByScenario[scenario.name] = {
    started: 0,
    ok: 0,
    failed: 0
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildUrl(path) {
  return `${config.url.replace(/\/$/, '')}${path}`;
}

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function chooseHttpScenario() {
  let randomWeight = Math.random() * totalScenarioWeight;

  for (const scenario of httpScenarios) {
    randomWeight -= scenario.weight;

    if (randomWeight <= 0) {
      return scenario;
    }
  }

  return httpScenarios.at(-1);
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

async function sendHttpRequest(source) {
  if (inFlightHttp.size >= config.maxInFlightHttp) {
    stats.httpSkippedByInFlightLimit += 1;
    return;
  }

  const scenario = chooseHttpScenario();
  stats.httpStarted += 1;
  stats.httpByScenario[scenario.name].started += 1;

  const request = scenario
    .request()
    .then(async (response) => {
      increment(stats.statusCodes, response.status);

      if (response.ok) {
        stats.httpOk += 1;
        stats.httpByScenario[scenario.name].ok += 1;
      } else {
        stats.httpFailed += 1;
        stats.httpByScenario[scenario.name].failed += 1;
      }

      await response.arrayBuffer();
    })
    .catch((error) => {
      stats.httpFailed += 1;
      stats.httpByScenario[scenario.name].failed += 1;
      console.warn(`${source} http ${scenario.name} failed: ${error.message}`);
    });

  inFlightHttp.add(request);
  request.finally(() => inFlightHttp.delete(request));
}

async function runFixedRateHttpLoop(label, rps, shouldRun) {
  const intervalMs = 1000 / rps;
  let nextRequestAt = Date.now();

  while (!shuttingDown && shouldRun()) {
    void sendHttpRequest(label);
    nextRequestAt += intervalMs;
    await sleep(Math.max(0, nextRequestAt - Date.now()));
  }
}

function createSocketClient() {
  nextSocketClientNumber += 1;
  const clientNumber = nextSocketClientNumber;
  const socket = io(config.url, {
    transports: config.transports,
    reconnection: false,
    timeout: config.socketAckTimeoutMs
  });

  sockets.set(clientNumber, socket);

  socket.on('connect', () => {
    stats.socketConnectedTotal += 1;
  });

  socket.on('connect_error', () => {
    stats.socketConnectionErrors += 1;
    socket.disconnect();
    sockets.delete(clientNumber);
  });

  socket.on('disconnect', () => {
    stats.socketDisconnectedTotal += 1;
    sockets.delete(clientNumber);
  });

  socket.on('message:error', () => {
    stats.dbMessagesFailed += 1;
  });
}

function getConnectedSockets() {
  return [...sockets.entries()]
    .filter(([, socket]) => socket.connected)
    .map(([clientNumber, socket]) => ({ clientNumber, socket }));
}

async function maintainSocketClients() {
  while (!shuttingDown) {
    const missingClients = config.socketClients - sockets.size;

    for (let index = 0; index < missingClients; index += 1) {
      createSocketClient();
      await sleep(100);
    }

    await sleep(config.socketMaintainIntervalMs);
  }
}

async function sendSocketDbMessage(client, messageNumber) {
  const payload = {
    author: `steady-socket-user-${client.clientNumber}`,
    content: `Steady traffic DB message ${messageNumber} from socket client ${client.clientNumber}`
  };

  stats.dbMessagesAttempted += 1;

  return new Promise((resolve) => {
    client.socket
      .timeout(config.socketAckTimeoutMs)
      .emit('message:send', payload, (error, response) => {
        if (error || !response?.ok) {
          stats.dbMessagesFailed += 1;
          resolve(false);
          return;
        }

        stats.dbMessagesSaved += 1;
        resolve(true);
      });
  });
}

async function runDbMessageLoop() {
  let messageNumber = 0;

  while (!shuttingDown) {
    const connectedClients = getConnectedSockets();

    if (connectedClients.length === 0) {
      console.warn('No connected Socket.IO clients available for DB message batch');
    } else {
      const sends = [];

      for (let index = 0; index < config.dbMessagesPerBatch; index += 1) {
        messageNumber += 1;
        const client = connectedClients[index % connectedClients.length];
        sends.push(sendSocketDbMessage(client, messageNumber));
      }

      await Promise.allSettled(sends);
    }

    await sleep(config.dbBatchIntervalMs);
  }
}

async function runSpikePlanner() {
  if (!config.spikesEnabled) {
    return;
  }

  while (!shuttingDown) {
    const gapMs = randomInt(config.spikeMinGapSeconds, config.spikeMaxGapSeconds) * 1000;
    await sleep(gapMs);

    if (shuttingDown) {
      return;
    }

    const extraRps = randomInt(config.spikeMinExtraRps, config.spikeMaxExtraRps);
    const durationMs =
      randomInt(config.spikeMinDurationSeconds, config.spikeMaxDurationSeconds) * 1000;
    const endsAt = Date.now() + durationMs;

    stats.spikesStarted += 1;
    currentSpike = {
      extraRps,
      endsAt
    };

    console.log(
      `traffic spike started extraRps=${extraRps} durationSeconds=${Math.round(
        durationMs / 1000
      )}`
    );

    await runFixedRateHttpLoop('spike', extraRps, () => Date.now() < endsAt);
    currentSpike = null;

    console.log('traffic spike ended');
  }
}

function printProgress() {
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  const connectedSockets = getConnectedSockets().length;
  const spikeExtraRps = currentSpike ? currentSpike.extraRps : 0;

  console.log(
    `progress elapsed=${elapsedSeconds}s baseHttpRps=${config.baseHttpRps} ` +
      `spikeExtraRps=${spikeExtraRps} connectedSockets=${connectedSockets}/${config.socketClients} ` +
      `httpStarted=${stats.httpStarted} httpOk=${stats.httpOk} httpFailed=${stats.httpFailed} ` +
      `dbAttempted=${stats.dbMessagesAttempted} dbSaved=${stats.dbMessagesSaved} ` +
      `dbFailed=${stats.dbMessagesFailed} inFlightHttp=${inFlightHttp.size}`
  );
}

async function runReporter() {
  while (!shuttingDown) {
    await sleep(config.reportIntervalMs);
    printProgress();
  }
}

function printSummary() {
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\nSteady traffic summary');
  console.log(`durationSeconds=${durationSeconds}`);
  console.log(`url=${config.url}`);
  console.log(`baseHttpRps=${config.baseHttpRps}`);
  console.log(`targetSocketClients=${config.socketClients}`);
  console.log(`connectedSocketsNow=${getConnectedSockets().length}`);
  console.log(`dbMessagesPerBatch=${config.dbMessagesPerBatch}`);
  console.log(`dbBatchIntervalMs=${config.dbBatchIntervalMs}`);
  console.log(`spikesStarted=${stats.spikesStarted}`);
  console.log(`httpStarted=${stats.httpStarted}`);
  console.log(`httpOk=${stats.httpOk}`);
  console.log(`httpFailed=${stats.httpFailed}`);
  console.log(`httpSkippedByInFlightLimit=${stats.httpSkippedByInFlightLimit}`);
  console.log(`statusCodes=${JSON.stringify(stats.statusCodes)}`);
  console.log(`dbMessagesAttempted=${stats.dbMessagesAttempted}`);
  console.log(`dbMessagesSaved=${stats.dbMessagesSaved}`);
  console.log(`dbMessagesFailed=${stats.dbMessagesFailed}`);
  console.log(`socketConnectedTotal=${stats.socketConnectedTotal}`);
  console.log(`socketDisconnectedTotal=${stats.socketDisconnectedTotal}`);
  console.log(`socketConnectionErrors=${stats.socketConnectionErrors}`);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const socket of sockets.values()) {
    socket.disconnect();
  }

  await Promise.allSettled([...inFlightHttp]);
  await sleep(500);
  printSummary();
  process.exit(exitCode);
}

async function main() {
  console.log('Starting steady realistic traffic');
  console.log(JSON.stringify(config, null, 2));
  console.log('Stop manually with Ctrl+C');

  await Promise.all([
    maintainSocketClients(),
    runFixedRateHttpLoop('base', config.baseHttpRps, () => true),
    runDbMessageLoop(),
    runSpikePlanner(),
    runReporter()
  ]);
}

process.on('SIGINT', () => {
  console.log('\nStopping steady traffic...');
  void shutdown(130);
});

process.on('SIGTERM', () => {
  console.log('\nStopping steady traffic...');
  void shutdown(143);
});

main().catch((error) => {
  console.error('Steady traffic failed', error);
  void shutdown(1);
});
