# CI/CD Guide

এই project-এ দুইটা GitHub Actions workflow আছে:

- CI: code quality verify করে
- Deploy: image build করে VPS-এ deploy করে

## CI Workflow

File:

```txt
.github/workflows/ci.yml
```

Runs on:

- push to `main`
- push to `master`
- pull request

Steps:

1. Checkout code
2. Setup Node.js 22
3. Install dependencies with `npm ci`
4. Syntax check with `npm run check`
5. Lint with `npm run lint`
6. Format check with `npm run format:check`
7. Test with `npm test`
8. Docker image build check

Purpose:

- broken code main branch-এ যাওয়ার আগে catch করা
- lint/format consistent রাখা
- Dockerfile buildable কিনা verify করা

## Deploy Workflow

File:

```txt
.github/workflows/deploy.yml
```

Runs on:

- push to `main`
- manual `workflow_dispatch`

Jobs:

1. `quality`: CI-like checks
2. `build-and-push`: Docker image build and push to GHCR
3. `deploy`: SSH into VPS and run production compose

Image registry:

```txt
ghcr.io/rahadul789/cicd
```

Image tags:

- `latest`
- Git commit SHA

## Required GitHub Secrets

Repository path:

```txt
Settings -> Secrets and variables -> Actions -> New repository secret
```

Required:

```txt
VPS_HOST=72.60.219.174
VPS_USER=deploy
VPS_SSH_KEY=<private SSH key>
```

Optional:

```txt
VPS_PORT=22
VPS_APP_DIR=/opt/node-observability-lab
```

## Deploy Flow

When you push to `main`:

1. GitHub Actions runs quality gate.
2. Docker image is built from `Dockerfile`.
3. Image is pushed to GHCR.
4. GitHub Actions connects to VPS by SSH.
5. VPS pulls latest git code.
6. VPS pulls new Docker image.
7. `docker compose -f compose.prod.yml up -d` starts app + monitoring.
8. Workflow checks app, Prometheus, Grafana, and Loki readiness.

## Check Deploy Status

In GitHub:

```txt
Repository -> Actions -> Deploy -> latest run
```

On VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail 100 app
```

Public app check:

```bash
curl http://72.60.219.174/health/ready
```

Private service checks on VPS:

```bash
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

## Manual Deploy From VPS

Use this when you want to debug without waiting for GitHub Actions:

```bash
cd /opt/node-observability-lab
git pull --ff-only origin main
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml ps
```

## Rollback Idea

GHCR keeps images by commit SHA. If a new deploy breaks, you can run an older image manually:

```bash
cd /opt/node-observability-lab
APP_IMAGE=ghcr.io/rahadul789/cicd:<old-commit-sha> docker compose -f compose.prod.yml up -d
```

Then check health:

```bash
curl http://127.0.0.1:3001/health/ready
```

For a stronger production system, add an automated rollback step later.
