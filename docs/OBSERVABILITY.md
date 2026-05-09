# Observability Guide

Observability মানে app ভিতরে কী হচ্ছে সেটা logs, metrics, and dashboards দিয়ে বোঝা।

এই project-এ তিনটা main signal আছে:

- Health: app alive/ready কিনা
- Metrics: number-based measurement
- Logs: event-by-event details

## Components

- App exposes `/metrics`
- Prometheus scrapes app metrics
- Grafana visualizes metrics and logs
- Loki stores logs
- Promtail collects Docker container logs and sends them to Loki
- Pino writes structured JSON logs from app

## Metrics Endpoint

```bash
curl http://localhost:3000/metrics
```

Important custom metrics:

- `app_http_requests_total`
- `app_http_request_duration_seconds`
- `app_http_errors_total`
- `app_socket_io_active_connections`
- `app_messages_sent_total`
- `app_mongodb_ready`
- `app_mongodb_ready_state`

Node.js default metrics are also exposed, such as memory, CPU, event loop, and GC metrics.

## Prometheus

Local:

```txt
http://localhost:9090
```

Production through SSH tunnel:

```bash
ssh -L 9090:127.0.0.1:9090 deploy@72.60.219.174
```

Then open:

```txt
http://localhost:9090
```

Check targets:

```txt
Status -> Targets
```

Expected targets:

- `node-app`
- `prometheus`
- `loki`

Useful PromQL:

```promql
sum(rate(app_http_requests_total[1m]))
sum(rate(app_http_errors_total[1m]))
histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le))
app_socket_io_active_connections
app_mongodb_ready
sum by (source) (app_messages_sent_total)
```

## Grafana

Local:

```txt
http://localhost:3001
```

Production through SSH tunnel:

```bash
ssh -L 3002:127.0.0.1:3002 deploy@72.60.219.174
```

Keep that terminal open, then browser:

```txt
http://localhost:3002
```

Dashboard path:

```txt
Dashboards -> Node Lab -> Node Observability Lab
```

Production login:

```txt
Username: admin
Password: VPS .env file-er GRAFANA_ADMIN_PASSWORD value
```

If password does not match, reset it on VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml exec grafana grafana cli admin reset-admin-password "YourStrongPassword123!"
docker compose -f compose.prod.yml restart grafana
```

## Loki Logs

Grafana থেকে:

```txt
Explore -> Loki
```

Useful Loki queries:

```logql
{service="app"}
{service="app"} |= "error"
{compose_project="node-observability-prod"}
```

If labels differ, open Grafana Explore and use label browser.

## Generate Test Traffic

Create some requests:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/api/messages
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d "{\"author\":\"Demo\",\"content\":\"Metrics test\"}"
```

If chaos routes are enabled locally:

```bash
curl "http://localhost:3000/api/demo/slow?ms=2000"
curl "http://localhost:3000/api/demo/error"
```

Then check:

- Prometheus query values increase
- Grafana dashboard panels update
- Loki logs show request and error events

## Generate Socket.IO Traffic

This project includes a Socket.IO traffic script for realtime load testing.

Default scenario:

- 50 connected Socket.IO clients
- each client sends 5 messages
- connections stay open for 30 seconds

Run against local app:

```bash
npm run traffic:socket
```

Run against production app from PowerShell:

```powershell
$env:SOCKET_TRAFFIC_URL="http://72.60.219.174"
npm run traffic:socket
```

More aggressive production scenario:

```powershell
$env:SOCKET_TRAFFIC_URL="http://72.60.219.174"
$env:SOCKET_TRAFFIC_CLIENTS="50"
$env:SOCKET_TRAFFIC_MESSAGES_PER_CLIENT="20"
$env:SOCKET_TRAFFIC_MESSAGE_INTERVAL_MS="250"
$env:SOCKET_TRAFFIC_HOLD_MS="60000"
npm run traffic:socket
```

After running it, check Grafana:

- active Socket.IO connections should rise while the script is holding connections
- messages sent should increase
- request/log panels should show realtime activity
- Loki should show Socket.IO connection and broadcast logs

Useful PromQL:

```promql
app_socket_io_active_connections
sum by (source) (app_messages_sent_total)
```

## Generate Mixed Traffic

This scenario is closer to a real busy app:

- 50 Socket.IO clients stay connected
- every socket client keeps sending messages
- 30 HTTP requests per second run in parallel
- total duration is 2 minutes

Run against production from PowerShell:

```powershell
$env:MIXED_TRAFFIC_URL="http://72.60.219.174"
npm run traffic:mixed
```

The default values are:

```txt
MIXED_TRAFFIC_DURATION_SECONDS=120
MIXED_TRAFFIC_HTTP_RPS=30
MIXED_TRAFFIC_SOCKET_CLIENTS=50
MIXED_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS=1000
```

So the default 2-minute run creates roughly:

- 3,600 HTTP requests
- 6,000 Socket.IO messages if all 50 clients stay connected

Customize it:

```powershell
$env:MIXED_TRAFFIC_URL="http://72.60.219.174"
$env:MIXED_TRAFFIC_DURATION_SECONDS="120"
$env:MIXED_TRAFFIC_HTTP_RPS="30"
$env:MIXED_TRAFFIC_SOCKET_CLIENTS="50"
$env:MIXED_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS="1000"
npm run traffic:mixed
```

Grafana/Prometheus-e watch:

```promql
sum(rate(app_http_requests_total[1m]))
app_socket_io_active_connections
sum by (source) (app_messages_sent_total)
histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le))
```

Note: mixed traffic production MongoDB Atlas-e fake messages save kore. Test sesh hole data cleanup lagte pare.

## Generate Steady Realistic Traffic

This scenario runs forever until you manually stop it with `Ctrl+C`.

Default behavior:

- base HTTP traffic never intentionally goes below 20 requests/second
- 15 Socket.IO clients stay connected
- every 5 seconds, 3 messages are sent through Socket.IO and saved to MongoDB
- random traffic spikes happen on top of the 20 requests/second base load

Run against production from PowerShell:

```powershell
$env:STEADY_TRAFFIC_URL="http://72.60.219.174"
npm run traffic:steady
```

Default values:

```txt
STEADY_TRAFFIC_BASE_HTTP_RPS=20
STEADY_TRAFFIC_SOCKET_CLIENTS=15
STEADY_TRAFFIC_DB_MESSAGES_PER_BATCH=3
STEADY_TRAFFIC_DB_BATCH_INTERVAL_MS=5000
STEADY_TRAFFIC_SPIKES_ENABLED=true
STEADY_TRAFFIC_SPIKE_MIN_GAP_SECONDS=30
STEADY_TRAFFIC_SPIKE_MAX_GAP_SECONDS=90
STEADY_TRAFFIC_SPIKE_MIN_DURATION_SECONDS=10
STEADY_TRAFFIC_SPIKE_MAX_DURATION_SECONDS=25
STEADY_TRAFFIC_SPIKE_MIN_EXTRA_RPS=40
STEADY_TRAFFIC_SPIKE_MAX_EXTRA_RPS=100
```

Customize spike intensity:

```powershell
$env:STEADY_TRAFFIC_URL="http://72.60.219.174"
$env:STEADY_TRAFFIC_BASE_HTTP_RPS="20"
$env:STEADY_TRAFFIC_SOCKET_CLIENTS="15"
$env:STEADY_TRAFFIC_SPIKE_MIN_EXTRA_RPS="80"
$env:STEADY_TRAFFIC_SPIKE_MAX_EXTRA_RPS="160"
npm run traffic:steady
```

Disable spikes:

```powershell
$env:STEADY_TRAFFIC_URL="http://72.60.219.174"
$env:STEADY_TRAFFIC_SPIKES_ENABLED="false"
npm run traffic:steady
```

Note: HTTP traffic in this script uses read-only endpoints. MongoDB writes come from the 3 Socket.IO messages every 5 seconds.

## Find Breaking Point

To discover how much traffic your VPS can handle, use the stress ramp script.

For detailed explanation of RPS, socket clients, p95 latency, error rate, and your actual stress test result, read [Capacity And Stress Testing Guide](CAPACITY_TESTING.md).

It increases traffic phase by phase and stops when:

- HTTP error rate reaches 10 percent
- or p95 latency reaches 3000ms
- or all socket clients disconnect

Run against production from PowerShell:

```powershell
$env:STRESS_TRAFFIC_URL="http://72.60.219.174"
npm run traffic:stress
```

Default ramp:

```txt
STRESS_TRAFFIC_PHASE_SECONDS=30
STRESS_TRAFFIC_HTTP_START_RPS=50
STRESS_TRAFFIC_HTTP_STEP_RPS=50
STRESS_TRAFFIC_HTTP_MAX_RPS=3000
STRESS_TRAFFIC_SOCKET_START_CLIENTS=50
STRESS_TRAFFIC_SOCKET_STEP_CLIENTS=25
STRESS_TRAFFIC_SOCKET_MAX_CLIENTS=1000
STRESS_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS=1000
STRESS_TRAFFIC_FAIL_ERROR_RATE_PERCENT=10
STRESS_TRAFFIC_FAIL_P95_MS=3000
```

For your KVM 1 VPS with 1 CPU core and 4GB memory, start with this practical run:

```powershell
$env:STRESS_TRAFFIC_URL="http://72.60.219.174"
$env:STRESS_TRAFFIC_PHASE_SECONDS="30"
$env:STRESS_TRAFFIC_HTTP_START_RPS="50"
$env:STRESS_TRAFFIC_HTTP_STEP_RPS="50"
$env:STRESS_TRAFFIC_HTTP_MAX_RPS="3000"
$env:STRESS_TRAFFIC_SOCKET_START_CLIENTS="50"
$env:STRESS_TRAFFIC_SOCKET_STEP_CLIENTS="25"
$env:STRESS_TRAFFIC_SOCKET_MAX_CLIENTS="1000"
$env:STRESS_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS="1000"
npm run traffic:stress
```

More aggressive run:

```powershell
$env:STRESS_TRAFFIC_URL="http://72.60.219.174"
$env:STRESS_TRAFFIC_PHASE_SECONDS="20"
$env:STRESS_TRAFFIC_HTTP_START_RPS="100"
$env:STRESS_TRAFFIC_HTTP_STEP_RPS="100"
$env:STRESS_TRAFFIC_HTTP_MAX_RPS="2000"
$env:STRESS_TRAFFIC_SOCKET_START_CLIENTS="100"
$env:STRESS_TRAFFIC_SOCKET_STEP_CLIENTS="50"
$env:STRESS_TRAFFIC_SOCKET_MAX_CLIENTS="500"
$env:STRESS_TRAFFIC_SOCKET_MESSAGE_INTERVAL_MS="500"
npm run traffic:stress
```

Professional interpretation:

- first phase where p95 latency crosses 3000ms is your practical limit
- first phase where errors cross 10 percent is your breaking point
- real production capacity should be much lower than the breaking point
- script prints `lastHealthyPhase`, `breakingPhase`, and a conservative `suggestedProductionTarget`

## Production Health Checks

Run on VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

Why monitoring ports are private:

- Grafana, Prometheus, and Loki expose operational data.
- Public internet-e open korle security risk.
- SSH tunnel দিয়ে access করা safer.
