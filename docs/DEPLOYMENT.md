# Production Deployment Guide

এই guide Ubuntu VPS + Docker + Nginx + GitHub Actions CD-এর জন্য।

Current production style:

- App Docker image GitHub Container Registry-তে push হবে।
- VPS image pull করে `compose.prod.yml` দিয়ে app চালাবে।
- Node app host-side only `127.0.0.1:3001` এ bind থাকবে, container-এর ভিতরে app `3000` port-এ চলবে।
- Nginx public HTTP traffic receive করে app-এ proxy করবে।
- Prometheus, Grafana, Loki, and Promtail same production compose stack-e run korbe.
- Monitoring ports only `127.0.0.1`-e bind thakbe, tai public internet theke directly open hobe na.
- Real secrets VPS-এর `.env` এবং GitHub Secrets-এ থাকবে।

## Production Files

- `compose.prod.yml`
- `deployment/nginx/ip-based.conf`
- `deployment/production.env.example`
- `monitoring/prometheus/prometheus.yml`
- `monitoring/grafana/provisioning`
- `monitoring/loki/local-config.yml`
- `monitoring/promtail/config.yml`
- `.github/workflows/deploy.yml`

## One-Time VPS Setup

SSH into the server:

```bash
ssh deploy@72.60.219.174
```

Create app directory:

```bash
sudo mkdir -p /opt/node-observability-lab
sudo chown -R deploy:deploy /opt/node-observability-lab
cd /opt/node-observability-lab
```

Clone repository:

```bash
git clone https://github.com/rahadul789/CICD.git .
```

Create production `.env`:

```bash
nano .env
```

Use this template:

```env
NODE_ENV=production
APP_NAME=node-observability-deployment-lab
PORT=3000
LOG_LEVEL=info
LOG_PRETTY=false
APP_INTERNAL_PORT=3001
PROMETHEUS_HOST_PORT=9090
GRAFANA_HOST_PORT=3002
LOKI_HOST_PORT=3100
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=change-this-strong-password

MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/node_observability_lab?retryWrites=true&w=majority

CORS_ORIGIN=*
ENABLE_CHAOS_ROUTES=false
CHAOS_MAX_DELAY_MS=10000
CHAOS_MAX_CPU_MS=5000
CHAOS_MAX_MEMORY_MB=100
```

Secure it:

```bash
chmod 600 .env
```

## Nginx Setup Without Domain

Copy the config:

```bash
sudo cp deployment/nginx/ip-based.conf /etc/nginx/sites-available/node-observability-lab
sudo ln -sf /etc/nginx/sites-available/node-observability-lab /etc/nginx/sites-enabled/node-observability-lab
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Then test:

```bash
curl http://72.60.219.174/health/live
curl http://72.60.219.174/health/ready
```

## Production Observability

`compose.prod.yml` production-e ei services run kore:

- `app`: Node.js application
- `prometheus`: app-er `/metrics` scrape kore
- `grafana`: dashboard and data visualization
- `loki`: logs store kore
- `promtail`: Docker container logs collect kore Loki-te pathay

Public browser theke only app/Nginx accessible:

```txt
http://72.60.219.174
```

Monitoring tools private localhost-only:

```txt
Prometheus: http://127.0.0.1:9090
Grafana: http://127.0.0.1:3002
Loki: http://127.0.0.1:3100
```

Tai nijer computer theke Grafana dekhte SSH tunnel open korte hobe:

```bash
ssh -L 3002:127.0.0.1:3002 deploy@72.60.219.174
```

Tunnel open rekhe browser-e open:

```txt
http://localhost:3002
```

Login:

```txt
Username: admin
Password: VPS .env-er GRAFANA_ADMIN_PASSWORD value
```

Prometheus dekhte chaile:

```bash
ssh -L 9090:127.0.0.1:9090 deploy@72.60.219.174
```

Then browser:

```txt
http://localhost:9090
```

Server theke direct health check:

```bash
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

## GitHub Container Registry

The deploy workflow pushes images to:

```txt
ghcr.io/rahadul789/cicd
```

If the package is private, log in once on the VPS:

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u rahadul789 --password-stdin
```

The token needs `read:packages`.

If the package is public, VPS login is not required.

## SSH Key For GitHub Actions

Create a deploy key on your local machine:

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$env:USERPROFILE\.ssh\cicd_vps_deploy"
```

Show the public key:

```powershell
type $env:USERPROFILE\.ssh\cicd_vps_deploy.pub
```

On the VPS, add that public key:

```bash
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Show the private key locally:

```powershell
type $env:USERPROFILE\.ssh\cicd_vps_deploy
```

Put that private key into GitHub Secret `VPS_SSH_KEY`.

## GitHub Secrets

Add these in:

```txt
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Required secrets:

```txt
VPS_HOST=72.60.219.174
VPS_USER=deploy
VPS_SSH_KEY=<private SSH key>
```

Optional secrets:

```txt
VPS_PORT=22
VPS_APP_DIR=/opt/node-observability-lab
```

## Deploy Flow

On push to `main`, `.github/workflows/deploy.yml` will:

1. Run syntax check, lint, format check, tests, and Docker build check.
2. Build Docker image.
3. Push image to GHCR as `latest` and commit SHA.
4. SSH into VPS.
5. Pull latest code with `git pull --ff-only origin main`.
6. Pull the new Docker image.
7. Run `docker compose -f compose.prod.yml up -d`.
8. Start or update app, Prometheus, Grafana, Loki, and Promtail.
9. Check app, Prometheus, Grafana, and Loki readiness.

## Manual App-Only Deploy

Normally production deploy `compose.prod.yml` diye korbe, karon etate app + monitoring shob ache. Sudhu app manually test korte chaile:

```bash
cd /opt/node-observability-lab
git pull --ff-only origin main
docker build -t node-observability-deployment-lab:prod .
docker rm -f node-observability-app || true
docker run -d \
  --name node-observability-app \
  --restart unless-stopped \
  --env-file .env \
  -e NODE_ENV=production \
  -e LOG_PRETTY=false \
  -e LOG_LEVEL=info \
  -p 127.0.0.1:3001:3000 \
  node-observability-deployment-lab:prod
```

## Useful Server Commands

```bash
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs -f app
docker compose -f compose.prod.yml logs -f prometheus
docker compose -f compose.prod.yml logs -f grafana
docker compose -f compose.prod.yml logs -f loki
docker compose -f compose.prod.yml logs -f promtail
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml down
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

## Later: Add Domain And HTTPS

When you buy a domain:

1. Add DNS `A` record pointing to `72.60.219.174`.
2. Replace `server_name _;` with your domain.
3. Install Certbot.
4. Run `sudo certbot --nginx -d yourdomain.com`.
