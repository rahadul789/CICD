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
