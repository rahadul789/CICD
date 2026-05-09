import { io } from 'socket.io-client';

const config = {
  url: process.env.STRESS_TRAFFIC_URL || 'http://localhost:3000',
  phaseSeconds: Number(process.env.STRESS_TRAFFIC_PHASE_SECONDS || 30),
  httpStartRps: Number(process.env.STRESS_TRAFFIC_HTTP_START_RPS || 50),
  httpStepRps: Number(process.env.STRESS_TRAFFIC_HTTP_STEP_RPS || 50),
  httpMaxRps: Number(process.env.STRESS_TRAFFIC_HTTP_MAX_RPS || 3000),
  httpTimeoutMs: Number(process.env.STRESS_TRAFFIC_HTTP_TIMEOUT_MS || 5000),
  maxInFlightHttp: Number(process.env.STRESS_TRAFFIC_MAX_IN_FLIGHT_HTTP || 2000),
  socketStartClients: Number(process.env.STRESS_TRAFFIC_SOCKET_START_CLIENTS || 50),
  socketStepClients: Number(process.env.STRESS_TRAFFIC_SOCKET_STEP_CLIENTS || 25),
  socketMaxClients: Number(process.env.STRESS_TRAFFIC_SOCKET_MAX_CLIENTS || 1000),
  socketMessageIntervalMs: Number(
    process.env.STRESS_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS || 1000
  ),
  socketConnectStaggerMs: Number(
    process.env.STRESS_TRAFFIC_SOCKET_CONNECT_STAGGER_MS || 30
  ),
  socketAckTimeoutMs: Number(process.env.STRESS_TRAFFIC_SOCKET_ACK_TIMEOUT_MS || 5000),
  failErrorRatePercent: Number(process.env.STRESS_TRAFFIC_FAIL_ERROR_RATE_PERCENT || 10),
  failP95Ms: Number(process.env.STRESS_TRAFFIC_FAIL_P95_MS || 3000),
  transports: (process.env.STRESS_TRAFFIC_SOCKET_TRANSPORTS || 'websocket,polling')
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean)
};

const startedAt = Date.now();
const sockets = [];
const socketLoops = [];
const inFlightHttp = new Set();
const globalStats = {
  httpStarted: 0,
  httpOk: 0,
  httpFailed: 0,
  socketConnected: 0,
  socketDisconnected: 0,
  socketSent: 0,
  socketAckOk: 0,
  socketAckFailed: 0,
  socketConnectionErrors: 0
};

let shuttingDown = false;
let nextSocketClientNumber = 0;
let lastHealthyPhase = null;
let breakingPhase = null;

const httpScenarios = [
  {
    name: 'health-live',
    weight: 8,
    request: () => fetchWithTimeout(buildUrl('/health/live'))
  },
  {
    name: 'health-ready',
    weight: 3,
    request: () => fetchWithTimeout(buildUrl('/health/ready'))
  },
  {
    name: 'messages-list',
    weight: 8,
    request: () => fetchWithTimeout(buildUrl('/api/messages?limit=50'))
  },
  {
    name: 'home',
    weight: 3,
    request: () => fetchWithTimeout(buildUrl('/'))
  },
  {
    name: 'metrics',
    weight: 1,
    request: () => fetchWithTimeout(buildUrl('/metrics'))
  },
  {
    name: 'messages-create',
    weight: 7,
    request: (requestNumber) =>
      fetchWithTimeout(buildUrl('/api/messages'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          author: 'stress-http-bot',
          content: `HTTP stress message ${requestNumber}`
        })
      })
  }
];

const totalScenarioWeight = httpScenarios.reduce(
  (sum, scenario) => sum + scenario.weight,
  0
);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(path) {
  return `${config.url.replace(/\/$/, '')}${path}`;
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

function percentile(values, percent) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percent / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function sendHttpRequest(requestNumber, phaseStats) {
  const scenario = chooseHttpScenario();
  const started = Date.now();

  phaseStats.started += 1;
  globalStats.httpStarted += 1;

  try {
    const response = await scenario.request(requestNumber);
    const latencyMs = Date.now() - started;
    phaseStats.latencies.push(latencyMs);

    if (response.ok) {
      phaseStats.ok += 1;
      globalStats.httpOk += 1;
    } else {
      phaseStats.failed += 1;
      globalStats.httpFailed += 1;
    }

    await response.arrayBuffer();
  } catch {
    const latencyMs = Date.now() - started;
    phaseStats.latencies.push(latencyMs);
    phaseStats.failed += 1;
    globalStats.httpFailed += 1;
  }
}

async function runHttpPhase(rps, phaseStats, stopAt) {
  const intervalMs = 1000 / rps;
  let nextRequestAt = Date.now();
  let requestNumber = 0;

  while (!shuttingDown && Date.now() < stopAt) {
    if (inFlightHttp.size >= config.maxInFlightHttp) {
      await sleep(10);
      continue;
    }

    requestNumber += 1;
    const request = sendHttpRequest(globalStats.httpStarted + requestNumber, phaseStats);
    inFlightHttp.add(request);
    request.finally(() => inFlightHttp.delete(request));

    nextRequestAt += intervalMs;
    await sleep(Math.max(0, nextRequestAt - Date.now()));
  }

  await Promise.allSettled([...inFlightHttp]);
}

function createSocket(clientNumber) {
  const socket = io(config.url, {
    transports: config.transports,
    reconnection: false,
    timeout: config.socketAckTimeoutMs
  });

  socket.on('connect', () => {
    globalStats.socketConnected += 1;
  });

  socket.on('connect_error', () => {
    globalStats.socketConnectionErrors += 1;
  });

  socket.on('disconnect', () => {
    globalStats.socketDisconnected += 1;
  });

  socket.on('message:error', () => {
    globalStats.socketAckFailed += 1;
  });

  sockets.push({
    clientNumber,
    socket
  });

  return socket;
}

async function waitForSocketConnection(socket) {
  if (socket.connected) {
    return true;
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
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

async function sendSocketMessage(socket, clientNumber, messageNumber) {
  const payload = {
    author: `stress-socket-user-${clientNumber}`,
    content: `Socket stress message ${messageNumber} from client ${clientNumber}`
  };

  return new Promise((resolve) => {
    socket
      .timeout(config.socketAckTimeoutMs)
      .emit('message:send', payload, (error, response) => {
        globalStats.socketSent += 1;

        if (error || !response?.ok) {
          globalStats.socketAckFailed += 1;
          resolve(false);
          return;
        }

        globalStats.socketAckOk += 1;
        resolve(true);
      });
  });
}

async function runSocketLoop(socket, clientNumber) {
  let messageNumber = 0;

  while (!shuttingDown && socket.connected) {
    messageNumber += 1;
    await sendSocketMessage(socket, clientNumber, messageNumber);
    await sleep(config.socketMessageIntervalMs);
  }
}

async function addSocketClients(targetClients) {
  const currentClients = sockets.length;
  const clientsToAdd = Math.max(0, targetClients - currentClients);

  for (let index = 0; index < clientsToAdd; index += 1) {
    nextSocketClientNumber += 1;
    const clientNumber = nextSocketClientNumber;
    const socket = createSocket(clientNumber);
    const connected = await waitForSocketConnection(socket);

    if (connected) {
      socketLoops.push(runSocketLoop(socket, clientNumber));
    } else {
      socket.disconnect();
    }

    await sleep(config.socketConnectStaggerMs);
  }
}

function getConnectedSocketCount() {
  return sockets.filter(({ socket }) => socket.connected).length;
}

function printPhaseResult(phase) {
  const errorRate =
    phase.started === 0 ? 0 : Number(((phase.failed / phase.started) * 100).toFixed(2));
  const p50 = Math.round(percentile(phase.latencies, 50));
  const p95 = Math.round(percentile(phase.latencies, 95));
  const p99 = Math.round(percentile(phase.latencies, 99));

  const result = {
    phase: phase.number,
    httpRps: phase.httpRps,
    socketClients: phase.socketClients,
    connectedSockets: getConnectedSocketCount(),
    httpStarted: phase.started,
    httpOk: phase.ok,
    httpFailed: phase.failed,
    errorRate,
    p50,
    p95,
    p99,
    socketSent: globalStats.socketSent,
    socketAckFailed: globalStats.socketAckFailed
  };

  console.log(
    `phase=${result.phase} httpRps=${result.httpRps} ` +
      `socketClients=${result.socketClients} connectedSockets=${result.connectedSockets} ` +
      `httpStarted=${result.httpStarted} httpOk=${result.httpOk} ` +
      `httpFailed=${result.httpFailed} errorRate=${result.errorRate}% ` +
      `p50=${result.p50}ms p95=${result.p95}ms p99=${result.p99}ms ` +
      `socketSent=${result.socketSent} socketAckFailed=${result.socketAckFailed}`
  );

  return result;
}

function shouldStop(result) {
  return (
    result.errorRate >= config.failErrorRatePercent ||
    result.p95 >= config.failP95Ms ||
    getConnectedSocketCount() === 0
  );
}

function printSummary(reason) {
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\nStress traffic summary');
  console.log(`reason=${reason}`);
  console.log(`durationSeconds=${durationSeconds}`);
  console.log(`url=${config.url}`);
  console.log(`httpStarted=${globalStats.httpStarted}`);
  console.log(`httpOk=${globalStats.httpOk}`);
  console.log(`httpFailed=${globalStats.httpFailed}`);
  console.log(`socketConnected=${globalStats.socketConnected}`);
  console.log(`connectedSocketsNow=${getConnectedSocketCount()}`);
  console.log(`socketSent=${globalStats.socketSent}`);
  console.log(`socketAckOk=${globalStats.socketAckOk}`);
  console.log(`socketAckFailed=${globalStats.socketAckFailed}`);
  console.log(`socketConnectionErrors=${globalStats.socketConnectionErrors}`);

  if (lastHealthyPhase) {
    console.log(`lastHealthyPhase=${JSON.stringify(lastHealthyPhase)}`);
    console.log(
      `suggestedProductionTarget=httpRps<=${Math.floor(
        lastHealthyPhase.httpRps * 0.5
      )}, socketClients<=${Math.floor(lastHealthyPhase.connectedSockets * 0.5)}`
    );
  }

  if (breakingPhase) {
    console.log(`breakingPhase=${JSON.stringify(breakingPhase)}`);
  }
}

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const { socket } of sockets) {
    socket.disconnect();
  }

  await Promise.allSettled([...inFlightHttp, ...socketLoops]);
  await sleep(500);
  printSummary(reason);
  process.exit(exitCode);
}

async function main() {
  console.log('Starting stress traffic ramp');
  console.log(JSON.stringify(config, null, 2));
  console.log(
    'Stop rule: ' +
      `errorRate >= ${config.failErrorRatePercent}% or p95 >= ${config.failP95Ms}ms`
  );

  let phaseNumber = 0;

  for (
    let httpRps = config.httpStartRps;
    httpRps <= config.httpMaxRps;
    httpRps += config.httpStepRps
  ) {
    phaseNumber += 1;

    const socketClients = Math.min(
      config.socketMaxClients,
      config.socketStartClients + (phaseNumber - 1) * config.socketStepClients
    );

    await addSocketClients(socketClients);

    const phaseStats = {
      number: phaseNumber,
      httpRps,
      socketClients,
      started: 0,
      ok: 0,
      failed: 0,
      latencies: []
    };

    const stopAt = Date.now() + config.phaseSeconds * 1000;
    await runHttpPhase(httpRps, phaseStats, stopAt);

    const result = printPhaseResult(phaseStats);

    if (shouldStop(result)) {
      breakingPhase = result;
      await shutdown(`breaking point reached at phase ${phaseNumber}`, 0);
      return;
    }

    lastHealthyPhase = result;
  }

  await shutdown('max configured traffic reached without breaking point', 0);
}

process.on('SIGINT', () => {
  console.log('\nStopping stress traffic...');
  void shutdown('interrupted', 130);
});

process.on('SIGTERM', () => {
  console.log('\nStopping stress traffic...');
  void shutdown('terminated', 143);
});

main().catch((error) => {
  console.error('Stress traffic failed', error);
  void shutdown('script error', 1);
});
