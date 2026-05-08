import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('app routes', () => {
  test('GET / returns service metadata', async () => {
    const response = await request(app).get('/').expect(200);

    expect(response.body.service).toBe('node-observability-deployment-lab-test');
    expect(response.body.status).toBe('running');
    expect(response.body.chaosRoutesEnabled).toBe(false);
    expect(response.body.endpoints.metrics).toBe('/metrics');
  });

  test('GET /health/live returns liveness status and request id', async () => {
    const response = await request(app).get('/health/live').expect(200);

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('node-observability-deployment-lab-test');
  });

  test('GET /health/ready reports not ready when MongoDB is disconnected', async () => {
    const response = await request(app).get('/health/ready').expect(503);

    expect(response.body.status).toBe('not_ready');
    expect(response.body.checks.database.isReady).toBe(false);
  });

  test('GET /api/demo is unavailable when chaos routes are disabled', async () => {
    const response = await request(app)
      .get('/api/demo')
      .set('x-request-id', 'test-chaos-disabled')
      .expect(404);

    expect(response.body.error.requestId).toBe('test-chaos-disabled');
  });

  test('not-found errors preserve incoming request id', async () => {
    const response = await request(app)
      .get('/missing-route')
      .set('x-request-id', 'test-request-id')
      .expect(404);

    expect(response.body.error.requestId).toBe('test-request-id');
    expect(response.body.error.message).toContain('Route not found');
  });

  test('GET /metrics exposes Prometheus metrics', async () => {
    const response = await request(app).get('/metrics').expect(200);

    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('app_http_requests_total');
    expect(response.text).toContain('app_mongodb_ready');
  });
});
