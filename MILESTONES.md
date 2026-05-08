# Node.js Professional Deployment Lab - Milestones

এই project-এর goal হলো scratch থেকে একটি professional Node.js deployment lab তৈরি করা, যেখানে application code, realtime communication, database, logging, metrics, Docker, CI/CD এবং production deployment একসাথে শেখা যাবে।

Tech stack:

- Node.js
- Express.js
- Socket.IO
- MongoDB
- Mongoose
- Pino logger
- Prometheus
- Grafana
- Loki
- Promtail
- Docker
- Docker Compose
- GitHub Actions
- Nginx
- Let's Encrypt

## Overall Flow

একজন client HTTP API অথবা Socket.IO event পাঠাবে। Express request handle করবে, Socket.IO realtime event broadcast করবে, MongoDB data save করবে, Pino structured log তৈরি করবে, Prometheus metrics scrape করবে, Grafana dashboard-এ metrics দেখাবে, Loki logs store করবে, আর Docker/CI-CD app deploy এবং run manage করবে।

## Milestone 1: Base Application

Goal: Node.js, Express.js, Socket.IO এবং MongoDB দিয়ে core backend application তৈরি করা।

Deliverables:

- `package.json`
- Express app setup
- HTTP server setup
- Socket.IO server setup
- MongoDB connection
- Mongoose message model
- REST API routes
- Socket.IO message event
- `.env.example`

Main endpoints:

- `GET /`
- `GET /health/live`
- `GET /health/ready`
- `GET /api/messages`
- `POST /api/messages`

Socket events:

- `connection`
- `disconnect`
- `message:send`
- `message:new`

Learning outcome:

- Express app কীভাবে request handle করে
- Socket.IO কীভাবে realtime connection রাখে
- MongoDB connection lifecycle কীভাবে কাজ করে
- REST API এবং realtime event একই server-এ কীভাবে চলে

Verification:

- App local machine-এ run করবে
- MongoDB connect হবে
- API দিয়ে message create/read করা যাবে
- Socket.IO দিয়ে realtime message broadcast হবে

## Milestone 2: Logging, Error Handling, and Health Checks

Goal: production-style structured logging এবং centralized error handling যোগ করা।

Packages:

- `pino`
- `pino-http`
- `pino-pretty`
- `http-errors`

Deliverables:

- centralized logger
- HTTP request logger
- request id support
- error middleware
- not-found middleware
- process-level error handling
- health and readiness checks

Logs include:

- app startup
- MongoDB connected/disconnected
- HTTP method, URL, status code, response time
- request id
- API errors
- Socket.IO connection/disconnection
- unhandled rejection
- uncaught exception

Learning outcome:

- `console.log` আর structured logger-এর পার্থক্য
- production logs কেন JSON হওয়া ভালো
- request id দিয়ে একটি request trace করা যায় কীভাবে
- error middleware কেন দরকার

Verification:

- successful API request log হবে
- failed API request error সহ log হবে
- health endpoint app status দেখাবে
- MongoDB unavailable হলে readiness fail করবে

## Milestone 3: Chaos and Failure Simulation Routes

Goal: real-world production issue simulate করার জন্য controlled demo routes তৈরি করা।

Important: এই routes default production mode-এ disabled থাকবে। `.env` এ `ENABLE_CHAOS_ROUTES=true` দিলে enable হবে।

Demo routes:

- `GET /api/demo/slow?ms=3000`
- `GET /api/demo/random-slow`
- `GET /api/demo/error`
- `GET /api/demo/unhandled-error`
- `GET /api/demo/crash`
- `GET /api/demo/cpu-spike`
- `GET /api/demo/memory-pressure`

Learning outcome:

- slow API হলে latency metrics কীভাবে বাড়ে
- error হলে logs এবং metrics-এ কী দেখা যায়
- crash হলে Docker restart policy কীভাবে কাজ করে
- CPU/memory issue observability dashboard-এ কীভাবে দেখা যায়

Verification:

- chaos disabled থাকলে routes unavailable থাকবে
- chaos enabled করলে routes কাজ করবে
- slow/error/crash behavior logs এবং metrics-এ দেখা যাবে

## Milestone 4: Metrics with Prometheus

Goal: application metrics expose করা, যাতে Prometheus scrape করতে পারে।

Package:

- `prom-client`

Endpoint:

- `GET /metrics`

Metrics:

- HTTP request count
- HTTP request duration
- HTTP error count
- active Socket.IO connections
- total messages sent
- MongoDB readiness status
- Node.js default process metrics

Learning outcome:

- logs আর metrics-এর পার্থক্য
- Prometheus pull model কীভাবে কাজ করে
- histogram, counter, gauge কী
- latency, error rate, traffic কীভাবে observe করা যায়

Verification:

- `/metrics` endpoint Prometheus format output দেবে
- API hit করলে request counter বাড়বে
- slow route call করলে latency histogram update হবে
- Socket.IO connect করলে active connection gauge বাড়বে

## Milestone 5: Docker and Local Observability Stack

Goal: local machine-এ পুরো production-like stack Docker Compose দিয়ে চালানো।

Services:

- app
- mongodb
- prometheus
- grafana
- loki
- promtail

Deliverables:

- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- Prometheus config
- Grafana provisioning
- Loki config
- Promtail config

Local URLs:

- App: `http://localhost:3000`
- Metrics: `http://localhost:3000/metrics`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3001`

Learning outcome:

- Docker image কীভাবে build হয়
- container network কীভাবে service-to-service communication করে
- Prometheus app scrape করে কীভাবে
- Grafana dashboard data source কীভাবে পায়
- Promtail Docker logs collect করে Loki-তে কীভাবে পাঠায়

Verification:

- `docker compose up --build` successful হবে
- app MongoDB container-এর সাথে connect করবে
- Prometheus target healthy দেখাবে
- Grafana dashboard metrics দেখাবে
- Loki logs query করা যাবে

## Milestone 6: Testing, Linting, and CI

Goal: code quality এবং automated verification setup করা।

Packages:

- `jest`
- `supertest`
- `eslint`
- `prettier`

Deliverables:

- unit/integration tests
- API tests
- lint config
- prettier config
- GitHub Actions CI workflow

CI steps:

- checkout code
- install dependencies
- run lint
- run tests
- build Docker image

Learning outcome:

- CI কেন দরকার
- pull request বা push হলে automated checks কীভাবে চলে
- deploy-এর আগে bug ধরা যায় কীভাবে

Verification:

- `npm test` pass করবে
- `npm run lint` pass করবে
- GitHub Actions CI successful হবে

## Milestone 7: Production Deployment and CD

Goal: Ubuntu VPS-style professional deployment setup তৈরি করা।

Production components:

- Docker Compose production file
- Nginx reverse proxy
- HTTPS with Let's Encrypt
- GitHub Actions deploy workflow
- GitHub Container Registry
- server environment file

Deliverables:

- `compose.prod.yml`
- Nginx config
- deployment README
- GitHub Actions CD workflow
- server setup checklist

CD flow:

1. Code push হবে main branch-এ।
2. GitHub Actions test/lint run করবে।
3. Docker image build হবে।
4. Image GitHub Container Registry-তে push হবে।
5. GitHub Actions SSH দিয়ে VPS-এ connect করবে।
6. VPS latest image pull করবে।
7. `docker compose up -d` দিয়ে app update হবে।
8. Health check pass হলে deployment complete হবে।

Learning outcome:

- CI আর CD-এর পার্থক্য
- Docker image registry কেন লাগে
- VPS deployment flow কীভাবে কাজ করে
- Nginx reverse proxy কেন দরকার
- HTTPS certificate কীভাবে কাজ করে

Verification:

- production compose file valid হবে
- Nginx app reverse proxy করতে পারবে
- GitHub Actions deploy workflow ready থাকবে
- deployment documentation follow করে VPS setup করা যাবে

## Milestone 8: Documentation and Final Walkthrough

Goal: পুরো system কীভাবে কাজ করে তা বাংলায় পরিষ্কার documentation তৈরি করা।

Deliverables:

- `README.md`
- local setup guide
- Docker setup guide
- observability guide
- CI/CD guide
- production deployment guide
- troubleshooting guide

Topics:

- request lifecycle
- Socket.IO lifecycle
- MongoDB lifecycle
- logging lifecycle
- metrics lifecycle
- Docker lifecycle
- CI/CD lifecycle
- failure simulation guide

Verification:

- fresh machine থেকে documentation follow করে project run করা যাবে
- logs এবং metrics দেখা যাবে
- chaos routes দিয়ে observability test করা যাবে

## Progress Tracker

- [x] Milestone 1: Base Application
- [x] Milestone 2: Logging, Error Handling, and Health Checks
- [x] Milestone 3: Chaos and Failure Simulation Routes
- [x] Milestone 4: Metrics with Prometheus
- [x] Milestone 5: Docker and Local Observability Stack
- [x] Milestone 6: Testing, Linting, and CI
- [ ] Milestone 7: Production Deployment and CD
- [ ] Milestone 8: Documentation and Final Walkthrough
