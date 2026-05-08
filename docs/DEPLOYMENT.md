# Production Deployment Guide

এই guide Ubuntu VPS + Docker + Nginx + GitHub Actions CD-এর জন্য।

Current production style:

- App Docker image GitHub Container Registry-তে push হবে।
- VPS image pull করে `compose.prod.yml` দিয়ে app চালাবে।
- Node app host-side only `127.0.0.1:3001` এ bind থাকবে, container-এর ভিতরে app `3000` port-এ চলবে।
- Nginx public HTTP traffic receive করে app-এ proxy করবে।
- Real secrets VPS-এর `.env` এবং GitHub Secrets-এ থাকবে।

## Production Files

- `compose.prod.yml`
- `deployment/nginx/ip-based.conf`
- `deployment/production.env.example`
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
8. Check `http://127.0.0.1:3001/health/ready`.

## Manual Production Deploy

If you want to deploy manually:

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
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
docker compose -f compose.prod.yml down
curl http://127.0.0.1:3001/health/ready
```

## Later: Add Domain And HTTPS

When you buy a domain:

1. Add DNS `A` record pointing to `72.60.219.174`.
2. Replace `server_name _;` with your domain.
3. Install Certbot.
4. Run `sudo certbot --nginx -d yourdomain.com`.
