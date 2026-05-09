import { io } from 'socket.io-client';

const config = {
  url: process.env.SOCKET_TRAFFIC_URL || 'http://localhost:3000',
  clients: Number(process.env.SOCKET_TRAFFIC_CLIENTS || 50),
  messagesPerClient: Number(process.env.SOCKET_TRAFFIC_MESSAGES_PER_CLIENT || 5),
  messageIntervalMs: Number(process.env.SOCKET_TRAFFIC_MESSAGE_INTERVAL_MS || 500),
  connectStaggerMs: Number(process.env.SOCKET_TRAFFIC_CONNECT_STAGGER_MS || 40),
  holdMs: Number(process.env.SOCKET_TRAFFIC_HOLD_MS || 30000),
  ackTimeoutMs: Number(process.env.SOCKET_TRAFFIC_ACK_TIMEOUT_MS || 5000),
  transports: (process.env.SOCKET_TRAFFIC_TRANSPORTS || 'websocket,polling')
    .split(',')
    .map((transport) => transport.trim())
    .filter(Boolean)
};

const stats = {
  connected: 0,
  welcomed: 0,
  disconnected: 0,
  sent: 0,
  ackOk: 0,
  ackFailed: 0,
  broadcastsReceived: 0,
  socketErrors: 0,
  connectionErrors: 0
};

const sockets = [];
const startedAt = Date.now();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSocket(clientNumber) {
  const socket = io(config.url, {
    transports: config.transports,
    reconnection: false,
    timeout: config.ackTimeoutMs
  });

  socket.on('connect', () => {
    stats.connected += 1;
    console.log(`client-${clientNumber} connected as ${socket.id}`);
  });

  socket.on('server:welcome', () => {
    stats.welcomed += 1;
  });

  socket.on('message:new', () => {
    stats.broadcastsReceived += 1;
  });

  socket.on('message:error', (error) => {
    stats.socketErrors += 1;
    console.warn(`client-${clientNumber} message:error`, error);
  });

  socket.on('connect_error', (error) => {
    stats.connectionErrors += 1;
    console.warn(`client-${clientNumber} connect_error: ${error.message}`);
  });

  socket.on('disconnect', (reason) => {
    stats.disconnected += 1;
    console.log(`client-${clientNumber} disconnected: ${reason}`);
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
      console.warn(`client-${clientNumber} connection timed out`);
      resolve(false);
    }, config.ackTimeoutMs);

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

async function sendMessage(socket, clientNumber, messageNumber) {
  const payload = {
    author: `socket-user-${clientNumber}`,
    content: `Socket fake traffic message ${messageNumber} from client ${clientNumber}`
  };

  return new Promise((resolve) => {
    socket
      .timeout(config.ackTimeoutMs)
      .emit('message:send', payload, (error, response) => {
        stats.sent += 1;

        if (error || !response?.ok) {
          stats.ackFailed += 1;
          console.warn(
            `client-${clientNumber} message-${messageNumber} failed: ${
              error?.message || response?.error?.message || 'unknown error'
            }`
          );
          resolve(false);
          return;
        }

        stats.ackOk += 1;
        resolve(true);
      });
  });
}

async function runClient(clientNumber) {
  const socket = createSocket(clientNumber);
  const connected = await waitForConnection(socket, clientNumber);

  if (!connected) {
    socket.disconnect();
    return;
  }

  for (
    let messageNumber = 1;
    messageNumber <= config.messagesPerClient;
    messageNumber += 1
  ) {
    await sendMessage(socket, clientNumber, messageNumber);
    await sleep(config.messageIntervalMs);
  }
}

function printSummary() {
  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\nSocket traffic summary');
  console.log(`durationSeconds=${durationSeconds}`);
  console.log(`url=${config.url}`);
  console.log(`clients=${config.clients}`);
  console.log(`messagesPerClient=${config.messagesPerClient}`);
  console.log(`expectedMessages=${config.clients * config.messagesPerClient}`);
  console.log(`connected=${stats.connected}`);
  console.log(`welcomed=${stats.welcomed}`);
  console.log(`sent=${stats.sent}`);
  console.log(`ackOk=${stats.ackOk}`);
  console.log(`ackFailed=${stats.ackFailed}`);
  console.log(`broadcastsReceived=${stats.broadcastsReceived}`);
  console.log(`socketErrors=${stats.socketErrors}`);
  console.log(`connectionErrors=${stats.connectionErrors}`);
  console.log(`disconnected=${stats.disconnected}`);
}

async function shutdown(exitCode = 0) {
  for (const socket of sockets) {
    socket.disconnect();
  }

  await sleep(500);
  printSummary();
  process.exit(exitCode);
}

process.on('SIGINT', () => {
  console.log('\nStopping socket traffic...');
  void shutdown(130);
});

process.on('SIGTERM', () => {
  console.log('\nStopping socket traffic...');
  void shutdown(143);
});

console.log('Starting Socket.IO fake traffic');
console.log(JSON.stringify(config, null, 2));

const clientRuns = [];

for (let clientNumber = 1; clientNumber <= config.clients; clientNumber += 1) {
  const clientRun = runClient(clientNumber).catch((error) => {
    stats.socketErrors += 1;
    console.error(`client-${clientNumber} failed`, error);
  });

  clientRuns.push(clientRun);

  await sleep(config.connectStaggerMs);
}

console.log(`All ${config.clients} clients launched. Waiting for message delivery.`);
await Promise.allSettled(clientRuns);

console.log(`Message delivery completed. Holding connections for ${config.holdMs}ms.`);
await sleep(config.holdMs);
await shutdown(0);
