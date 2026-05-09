# Node Observability Deployment Lab

এই project scratch থেকে বানানো একটি professional Node.js deployment and observability lab.
এখানে backend app, realtime Socket.IO, MongoDB Atlas, structured logs, Prometheus metrics,
Grafana dashboard, Loki logs, Docker, CI/CD, and VPS deployment একসাথে আছে।

## Current Status

- Milestone 1: Node.js + Express + Socket.IO + MongoDB base app
- Milestone 2: Pino structured logging, request id, centralized error handling
- Milestone 3: controlled chaos and failure simulation routes
- Milestone 4: Prometheus metrics endpoint and custom app metrics
- Milestone 5: Docker Compose local observability stack
- Milestone 6: tests, linting, formatting, and CI workflow
- Milestone 7: production deployment and CD to VPS
- Milestone 8: final documentation, walkthrough, troubleshooting, and checklist

## Architecture

```txt
Client
  |
  v
Nginx on VPS
  |
  v
Docker Compose production stack
  |
  +-- Node.js app -> MongoDB Atlas
  +-- Prometheus -> scrape app /metrics
  +-- Grafana -> read Prometheus metrics and Loki logs
  +-- Loki -> store logs
  +-- Promtail -> collect Docker container logs

GitHub Actions -> GHCR Docker image -> SSH deploy to VPS
```

## Quick Start

Install dependencies:

```bash
npm install
```

Create `.env` from `.env.example`, then set your real `MONGO_URI`.

Run locally:

```bash
npm run dev
```

Check app:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3000/metrics
curl http://localhost:3000/api/messages
```

Run full local Docker observability stack:

```bash
docker compose up -d --build
```

Stop local stack:

```bash
docker compose down
```

## Main URLs

Local:

- App: `http://localhost:3000`
- Metrics: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Loki: `http://localhost:3100`

Production:

- App through Nginx: `http://72.60.219.174`
- App internal health: `http://127.0.0.1:3001/health/ready`
- Grafana through SSH tunnel: `http://localhost:3002`
- Prometheus through SSH tunnel: `http://localhost:9090`

## Main API

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /api/messages`
- `POST /api/messages`

Create message:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"author\":\"Arif\",\"content\":\"Hello from API\"}"
```

## Socket.IO Events

Client sends:

- `message:send`

Server emits:

- `server:welcome`
- `message:new`
- `message:error`

## Quality Commands

```bash
npm run check
npm run lint
npm run format:check
npm test
```

Format files:

```bash
npm run format
```

## Documentation

- [Local Setup](docs/LOCAL_SETUP.md)
- [Observability Guide](docs/OBSERVABILITY.md)
- [Capacity And Stress Testing Guide](docs/CAPACITY_TESTING.md)
- [CI/CD Guide](docs/CICD.md)
- [Production Deployment Guide](docs/DEPLOYMENT.md)
- [Production Checklist](docs/PRODUCTION_CHECKLIST.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)
- [Final Walkthrough](docs/FINAL_WALKTHROUGH.md)

## Important Notes

- Real secrets must stay in `.env` or GitHub Secrets, never in git.
- Production chaos routes are disabled by default.
- Production Grafana, Prometheus, and Loki are private localhost-only services.
- Use SSH tunnel to view production Grafana safely.
- Add domain + HTTPS before exposing this as a real public service.
