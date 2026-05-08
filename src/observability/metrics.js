import promClient from 'prom-client';
import { env } from '../config/env.js';
import { getDatabaseStatus } from '../config/database.js';

export const metricsRegistry = new promClient.Registry();

metricsRegistry.setDefaultLabels({
  app: env.appName,
  environment: env.nodeEnv
});

promClient.collectDefaultMetrics({
  register: metricsRegistry
});

export const httpRequestsTotal = new promClient.Counter({
  name: 'app_http_requests_total',
  help: 'Total number of HTTP requests handled by the app.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry]
});

export const httpRequestDurationSeconds = new promClient.Histogram({
  name: 'app_http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry]
});

export const httpErrorsTotal = new promClient.Counter({
  name: 'app_http_errors_total',
  help: 'Total number of HTTP responses with status code 4xx or 5xx.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [metricsRegistry]
});

export const socketActiveConnections = new promClient.Gauge({
  name: 'app_socket_io_active_connections',
  help: 'Current number of active Socket.IO connections.',
  registers: [metricsRegistry]
});

export const messagesSentTotal = new promClient.Counter({
  name: 'app_messages_sent_total',
  help: 'Total number of messages created through API or Socket.IO.',
  labelNames: ['source'],
  registers: [metricsRegistry]
});

export const mongodbReady = new promClient.Gauge({
  name: 'app_mongodb_ready',
  help: 'MongoDB readiness status. 1 means ready, 0 means not ready.',
  registers: [metricsRegistry],
  collect() {
    this.set(getDatabaseStatus().isReady ? 1 : 0);
  }
});

export const mongodbReadyState = new promClient.Gauge({
  name: 'app_mongodb_ready_state',
  help: 'Raw Mongoose readyState value: 0 disconnected, 1 connected, 2 connecting, 3 disconnecting.',
  registers: [metricsRegistry],
  collect() {
    this.set(getDatabaseStatus().readyState);
  }
});

function normalizeRoutePath(baseUrl, routePath) {
  const path = Array.isArray(routePath) ? routePath[0] : routePath;

  if (typeof path !== 'string') {
    return 'unknown';
  }

  const suffix = path === '/' ? '' : path;
  return `${baseUrl || ''}${suffix}` || '/';
}

export function getHttpRouteLabel(req) {
  if (!req.route) {
    return 'unmatched';
  }

  return normalizeRoutePath(req.baseUrl, req.route.path);
}

export function recordHttpRequest({ req, res, durationSeconds }) {
  const labels = {
    method: req.method,
    route: getHttpRouteLabel(req),
    status_code: String(res.statusCode)
  };

  httpRequestsTotal.inc(labels);
  httpRequestDurationSeconds.observe(labels, durationSeconds);

  if (res.statusCode >= 400) {
    httpErrorsTotal.inc(labels);
  }
}

export function recordSocketConnected() {
  socketActiveConnections.inc();
}

export function recordSocketDisconnected() {
  socketActiveConnections.dec();
}

export function recordMessageSent(source) {
  messagesSentTotal.inc({ source });
}
