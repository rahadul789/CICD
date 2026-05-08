import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './observability/logger.js';
import { setupSocketServer } from './sockets/index.js';

async function bootstrap() {
  logger.info({ nodeEnv: env.nodeEnv, port: env.port }, 'Starting application');

  await connectDatabase(env.mongoUri);

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin === '*' ? true : env.corsOrigin,
      credentials: true
    }
  });

  app.set('io', io);
  setupSocketServer(io);

  server.listen(env.port, () => {
    logger.info({ port: env.port }, 'HTTP server listening');
  });

  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }

    isShuttingDown = true;

    logger.info({ signal }, 'Shutting down gracefully');

    io.close();

    server.close(async () => {
      await disconnectDatabase();
      logger.info('HTTP server closed');
      process.exit(0);
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
}

bootstrap().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
