import { performance } from 'node:perf_hooks';
import { recordHttpRequest } from '../observability/metrics.js';

export function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') {
    next();
    return;
  }

  const startedAt = performance.now();

  res.on('finish', () => {
    const durationSeconds = (performance.now() - startedAt) / 1000;
    recordHttpRequest({ req, res, durationSeconds });
  });

  next();
}
