# Final Walkthrough

এই walkthrough project-এর পুরো system কীভাবে কাজ করে সেটা end-to-end explain করে।

## Big Picture

```txt
User request
  -> Nginx
  -> Docker container
  -> Express route
  -> Controller
  -> MongoDB Atlas
  -> JSON response

At the same time:
  -> Pino log writes to stdout
  -> Docker stores JSON logs
  -> Promtail sends logs to Loki
  -> Metrics middleware updates Prometheus metrics
  -> Prometheus scrapes /metrics
  -> Grafana shows dashboard
```

## HTTP Request Lifecycle

1. User calls an endpoint like `GET /api/messages`.
2. Nginx receives request on public port `80`.
3. Nginx forwards request to app on `127.0.0.1:3001`.
4. Docker maps host `3001` to container `3000`.
5. Express receives request.
6. Request logger adds request id and logs request info.
7. Metrics middleware starts measuring request duration.
8. Route handler runs controller logic.
9. Controller reads/writes MongoDB through Mongoose.
10. Response returns to client.
11. Metrics middleware records status code, route, duration, and errors.

## Health Lifecycle

Liveness:

```txt
GET /health/live
```

Meaning: app process is alive.

Readiness:

```txt
GET /health/ready
```

Meaning: app is ready to serve real traffic. MongoDB must be connected.

Docker healthcheck uses liveness because container restart should depend on app process health.

Deployment readiness check uses readiness because deploy should succeed only when app can serve real traffic.

## Message API Lifecycle

Create message:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"author\":\"Arif\",\"content\":\"Hello\"}"
```

Flow:

1. Express receives POST request.
2. Input is normalized and validated.
3. Mongoose saves message in MongoDB.
4. `app_messages_sent_total` metric increases.
5. Response returns saved message.
6. Logs include request metadata and status.

## Socket.IO Lifecycle

1. Client connects to Socket.IO server.
2. Server logs connection.
3. Active socket gauge increases.
4. Server emits `server:welcome`.
5. Client sends `message:send`.
6. Server validates payload.
7. Message is saved to MongoDB.
8. Server broadcasts `message:new`.
9. Message metric increases.
10. On disconnect, active socket gauge decreases.

## Logging Lifecycle

App uses Pino.

Local:

- readable logs if pretty logging is enabled

Production:

- JSON logs
- easier for log collectors
- includes level, time, request id, method, URL, status, and response time

Log flow in production:

```txt
App stdout -> Docker json-file logs -> Promtail -> Loki -> Grafana Explore
```

## Metrics Lifecycle

App uses `prom-client`.

Flow:

```txt
Request happens
  -> metrics middleware records data
  -> /metrics exposes Prometheus format
  -> Prometheus scrapes app
  -> Grafana queries Prometheus
```

Prometheus pull model means app does not push metrics. Prometheus periodically calls:

```txt
http://app:3000/metrics
```

inside Docker network.

## Docker Lifecycle

Dockerfile:

1. Uses `node:22-alpine`.
2. Installs production dependencies with `npm ci --omit=dev`.
3. Copies app source.
4. Creates non-root user.
5. Runs `node src/server.js`.

Local compose:

```txt
docker-compose.yml
```

Production compose:

```txt
compose.prod.yml
```

Production compose starts:

- app
- prometheus
- grafana
- loki
- promtail

## CI/CD Lifecycle

Push to `main`:

1. GitHub Actions quality gate runs.
2. Docker image builds.
3. Image pushes to GHCR.
4. GitHub Actions SSH connects to VPS.
5. VPS pulls new image.
6. Docker Compose recreates changed containers.
7. Health checks verify app and monitoring.

## Failure Simulation Lifecycle

Chaos routes help you see real production symptoms in a controlled way.

Slow route:

```bash
curl "http://localhost:3000/api/demo/slow?ms=3000"
```

Expected:

- latency histogram increases
- Grafana p95 latency changes
- request log shows longer response time

Error route:

```bash
curl "http://localhost:3000/api/demo/error"
```

Expected:

- HTTP error counter increases
- app logs error
- Grafana error panel changes

Crash route:

```bash
curl "http://localhost:3000/api/demo/crash?confirm=true"
```

Expected:

- process exits
- Docker restart policy starts container again
- logs show crash/restart behavior

Use crash routes only in local or controlled demo environments.

## Final Manual Demo

Local:

```bash
npm install
npm test
docker compose up -d --build
curl http://localhost:3000/health/ready
curl http://localhost:3000/metrics
```

Production:

```bash
ssh deploy@72.60.219.174
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

Grafana:

```bash
ssh -L 3002:127.0.0.1:3002 deploy@72.60.219.174
```

Browser:

```txt
http://localhost:3002
```

This confirms the full system: app, database, metrics, logs, dashboard, Docker, and deployment.
