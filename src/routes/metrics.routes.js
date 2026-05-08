import { Router } from 'express';
import { metricsRegistry } from '../observability/metrics.js';

export const metricsRouter = Router();

metricsRouter.get('/', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (error) {
    next(error);
  }
});
