# Node Observability Deployment Lab

এই project scratch থেকে professional Node.js deployment শেখার জন্য বানানো হচ্ছে।

Current status:

- Milestone 1 complete: Node.js + Express + Socket.IO + MongoDB base app
- Milestone 2 complete: Pino structured logging, request id, centralized errors
- Milestone 3 complete: controlled chaos and failure simulation routes
- Milestone 4 complete: Prometheus metrics endpoint and custom app metrics
- Milestone 5 complete: Docker Compose observability stack
- Milestone 6 complete: tests, linting, formatting, and CI workflow

## Local Run

1. Dependencies install করুন:

```bash
npm install
```

2. `.env.example` থেকে `.env` তৈরি করুন এবং দরকার হলে value বদলান।

3. MongoDB Atlas URI `.env` ফাইলে রাখুন।

Atlas Network Access-এ আপনার current IP whitelist থাকতে হবে।

4. Development server চালান:

```bash
npm run dev
```

5. API check করুন:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3000/metrics
curl http://localhost:3000/api/messages
```

## Main API

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /metrics`
- `GET /api/messages`
- `POST /api/messages`

Create message example:

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

## Logging

এই project structured logging-এর জন্য Pino use করে।

Local development-এ logs readable format-এ দেখা যাবে, আর production-এ JSON logs output হবে। প্রতিটা HTTP request-এ একটি request id থাকবে।

Useful behavior:

- incoming `x-request-id` থাকলে app সেটা preserve করবে
- না থাকলে app নিজে request id generate করবে
- response header-এ `x-request-id` ফেরত যাবে
- error response body-তেও `requestId` থাকবে
- server startup, MongoDB lifecycle, HTTP requests, API errors এবং Socket.IO events log হবে

Example error response:

```json
{
  "error": {
    "message": "Route not found: GET /missing",
    "statusCode": 404,
    "requestId": "demo-request-id"
  }
}
```

Local log level `.env` থেকে control করা যাবে:

```bash
LOG_LEVEL=debug
```

## Chaos Routes

Chaos routes production issue simulate করার জন্য। এগুলো default off থাকে।

Enable করতে `.env` এ set করুন:

```bash
ENABLE_CHAOS_ROUTES=true
CHAOS_MAX_DELAY_MS=10000
CHAOS_MAX_CPU_MS=5000
CHAOS_MAX_MEMORY_MB=100
```

Available routes:

- `GET /api/demo`
- `GET /api/demo/slow?ms=3000`
- `GET /api/demo/random-slow?min=500&max=5000`
- `GET /api/demo/error`
- `GET /api/demo/cpu-spike?ms=1000`
- `GET /api/demo/memory-pressure?mb=25`
- `GET /api/demo/memory-pressure?mb=25&retain=true&confirm=true`
- `GET /api/demo/memory-release`

Destructive routes:

- `GET /api/demo/unhandled-error?confirm=true`
- `GET /api/demo/crash?confirm=true`

এই destructive routes server বন্ধ করে দিতে পারে, তাই এগুলো শুধু local/controlled environment-এ চালাবেন।

Example:

```bash
curl "http://localhost:3000/api/demo/slow?ms=2000"
curl "http://localhost:3000/api/demo/error" -H "x-request-id: demo-error-1"
```

## Metrics

Prometheus-compatible metrics endpoint:

```bash
curl http://localhost:3000/metrics
```

Custom metrics:

- `app_http_requests_total`
- `app_http_request_duration_seconds`
- `app_http_errors_total`
- `app_socket_io_active_connections`
- `app_messages_sent_total`
- `app_mongodb_ready`
- `app_mongodb_ready_state`

Node.js default metrics also expose হবে, যেমন CPU, memory, event loop এবং garbage collection related metrics।

Useful PromQL examples:

```promql
sum(rate(app_http_requests_total[1m]))
sum(rate(app_http_errors_total[1m]))
histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le))
app_socket_io_active_connections
app_mongodb_ready
sum by (source) (app_messages_sent_total)
```

Standalone app `/metrics` expose করে। Docker stack চালালে Prometheus automatically এই endpoint scrape করে।

## Docker Stack

Full local observability stack চালাতে:

```bash
docker compose up -d --build
```

যদি port `3000` busy থাকে, PowerShell-এ:

```powershell
$env:APP_HOST_PORT="3002"
docker compose up -d --build
```

এই machine-এ Docker stack app `3002` port-এ চালানো হয়েছে, কারণ `3000` আগে থেকেই busy ছিল।

Default URLs:

- App: `http://localhost:3000`
- Metrics: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Loki: `http://localhost:3100`
  এই run-এর URLs:

- App: `http://localhost:3002`
- Metrics: `http://localhost:3002/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`
- Loki: `http://localhost:3100`

Grafana dashboard:

- `http://localhost:3001/d/node-observability-lab/node-observability-lab`

Grafana login:

- username: `admin`
- password: `admin`

Useful Docker commands:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f promtail
docker compose down
```

সব volume সহ data মুছতে:

```bash
docker compose down -v
```

Prometheus targets check:

```bash
curl http://localhost:9090/api/v1/targets
```

Loki readiness check:

```bash
curl http://localhost:3100/ready
```

এই stack-এ Prometheus app-এর `/metrics` scrape করে, Grafana Prometheus/Loki datasource auto-provision করে, আর Promtail Docker container logs Loki-তে push করে।

## Quality Checks

Local quality commands:

```bash
npm run check
npm run lint
npm run format:check
npm test
```

Auto-format করতে:

```bash
npm run format
```

Tests real MongoDB/Atlas hit করে না। CI-safe tests app routes, health responses, request id behavior, metrics endpoint, এবং message validation check করে।

CI workflow:

- file: `.github/workflows/ci.yml`
- runs on push to `main`/`master`
- runs on pull request
- steps: `npm ci`, syntax check, lint, format check, tests, Docker image build

Lets test is github action is working
