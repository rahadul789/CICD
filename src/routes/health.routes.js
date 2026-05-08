import { Router } from 'express';
import { env } from '../config/env.js';
import { getDatabaseStatus } from '../config/database.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req, res) => {
  res.json({
    status: 'ok',
    service: env.appName,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    reason: 'My name ,yes,haha'
  });
});

healthRouter.get('/ready', (_req, res) => {
  const database = getDatabaseStatus();
  const statusCode = database.isReady ? 200 : 503;

  res.status(statusCode).json({
    status: database.isReady ? 'ready' : 'not_ready',
    service: env.appName,
    checks: {
      database
    },
    timestamp: new Date().toISOString(),
    hola: 'hola'
  });
});
