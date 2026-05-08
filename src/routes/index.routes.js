import { Router } from 'express';
import { env } from '../config/env.js';

export const indexRouter = Router();

indexRouter.get('/', (_req, res) => {
  res.json({
    service: env.appName,
    status: 'running',
    docs: {
      milestones: 'MILESTONES.md'
    },
    endpoints: {
      live: '/health/live',
      ready: '/health/ready',
      messages: '/api/messages',
      metrics: '/metrics',
      demo: env.enableChaosRoutes ? '/api/demo' : null
    },
    chaosRoutesEnabled: env.enableChaosRoutes,
    socketEvents: {
      clientToServer: ['message:send'],
      serverToClient: ['server:welcome', 'message:new', 'message:error']
    }
  });
});
