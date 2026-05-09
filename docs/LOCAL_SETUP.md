# Local Setup Guide

এই guide fresh machine থেকে local app এবং local observability stack run করার জন্য।

## Prerequisites

- Node.js 22 or newer
- npm
- Docker Desktop or Docker Engine
- MongoDB Atlas connection string

Check versions:

```bash
node --version
npm --version
docker --version
docker compose version
```

## Environment File

Project root-এ `.env.example` দেখে `.env` তৈরি করো।

Important values:

```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug
LOG_PRETTY=false
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/node_observability_lab?retryWrites=true&w=majority
CORS_ORIGIN=*
ENABLE_CHAOS_ROUTES=false
```

MongoDB Atlas ব্যবহার করলে Atlas Network Access-এ তোমার current IP allow থাকতে হবে।

## Run App Without Docker

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Read messages:

```bash
curl http://localhost:3000/api/messages
```

Create message:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"author\":\"Arif\",\"content\":\"Hello from local\"}"
```

Metrics:

```bash
curl http://localhost:3000/metrics
```

## Run Full Local Docker Stack

This starts:

- app
- Prometheus
- Grafana
- Loki
- Promtail

```bash
docker compose up -d --build
```

Check containers:

```bash
docker compose ps
```

Open:

- App: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Loki readiness: `http://localhost:3100/ready`

Grafana local login:

```txt
Username: admin
Password: admin
```

If local port `3000` is busy on PowerShell:

```powershell
$env:APP_HOST_PORT="3002"
docker compose up -d --build
```

Then app opens at:

```txt
http://localhost:3002
```

## Useful Local Docker Commands

Follow app logs:

```bash
docker compose logs -f app
```

Follow Promtail logs:

```bash
docker compose logs -f promtail
```

Restart app:

```bash
docker compose restart app
```

Stop stack:

```bash
docker compose down
```

Stop stack and remove volumes:

```bash
docker compose down -v
```

## Chaos Routes

Chaos routes are for learning production failure behavior.

Enable in `.env`:

```env
ENABLE_CHAOS_ROUTES=true
```

Restart server, then test:

```bash
curl "http://localhost:3000/api/demo/slow?ms=2000"
curl "http://localhost:3000/api/demo/error"
curl "http://localhost:3000/api/demo/cpu-spike?ms=1000"
curl "http://localhost:3000/api/demo/memory-pressure?mb=25"
```

Dangerous routes:

```bash
curl "http://localhost:3000/api/demo/unhandled-error?confirm=true"
curl "http://localhost:3000/api/demo/crash?confirm=true"
```

এই dangerous routes server crash করতে পারে, তাই শুধু local controlled environment-এ চালাবে।

## Quality Checks

```bash
npm run check
npm run lint
npm run format:check
npm test
```

These tests do not hit real MongoDB Atlas; they are CI-safe.
