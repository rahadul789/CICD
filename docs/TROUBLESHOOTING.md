# Troubleshooting Guide

Common problems and exact commands.

## Port Is Already Allocated

Error example:

```txt
Bind for 127.0.0.1:3000 failed: port is already allocated
```

Meaning: another process/container already uses that port.

Check on VPS:

```bash
sudo ss -ltnp | grep ':3000'
docker ps
```

Remove old manual app container:

```bash
docker rm -f node-observability-app || true
```

Production now uses:

- app host port: `127.0.0.1:3001`
- app container port: `3000`
- Grafana host port: `127.0.0.1:3002`

## SSH Permission Denied From GitHub Actions

Error:

```txt
Permission denied (publickey,password)
```

Check:

- `VPS_USER` is correct
- `VPS_SSH_KEY` is the private key, not public key
- public key exists in `/home/deploy/.ssh/authorized_keys`
- key file has no missing header/footer

On VPS:

```bash
whoami
mkdir -p ~/.ssh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

From local machine:

```bash
ssh -i ~/.ssh/cicd_vps_deploy deploy@72.60.219.174
```

## Container Starts Then Exits

Check logs:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail 100 app
```

Common causes:

- wrong `MONGO_URI`
- missing `.env`
- Atlas IP not allowed
- app port conflict
- syntax/runtime error

## MongoDB Readiness Fails

Check:

```bash
curl http://127.0.0.1:3001/health/ready
docker compose -f compose.prod.yml logs --tail 100 app
```

Fix checklist:

- MongoDB Atlas username/password correct
- database user has correct permissions
- Atlas Network Access allows VPS IP
- URI includes database name
- no special character in password breaking URI encoding

## Grafana Password Does Not Match

`GRAFANA_ADMIN_PASSWORD` only applies when Grafana data volume is created first time.

Reset on VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml exec grafana grafana cli admin reset-admin-password "YourStrongPassword123!"
docker compose -f compose.prod.yml restart grafana
```

Then open through SSH tunnel:

```bash
ssh -L 3002:127.0.0.1:3002 deploy@72.60.219.174
```

Browser:

```txt
http://localhost:3002
```

## Prometheus Target Down

Check Prometheus readiness:

```bash
curl http://127.0.0.1:9090/-/ready
```

Open Prometheus through tunnel:

```bash
ssh -L 9090:127.0.0.1:9090 deploy@72.60.219.174
```

Browser:

```txt
http://localhost:9090/targets
```

Check app metrics from inside Docker network:

```bash
docker compose -f compose.prod.yml exec prometheus wget -qO- http://app:3000/metrics
```

## Grafana Dashboard Has No Data

Generate traffic:

```bash
curl http://72.60.219.174/health/live
curl http://72.60.219.174/api/messages
```

Then check:

- dashboard time range is last 5 or 15 minutes
- Prometheus datasource is healthy
- Prometheus target `node-app` is up

## Loki Logs Not Showing

Check:

```bash
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail 100 promtail
docker compose -f compose.prod.yml logs --tail 100 loki
```

Grafana Explore query:

```logql
{service="app"}
```

If no result, use label browser in Grafana Explore to inspect available labels.

## Nginx 502 Bad Gateway

Check app internal health:

```bash
curl http://127.0.0.1:3001/health/live
```

Check Nginx config:

```bash
sudo nginx -t
sudo systemctl status nginx
sudo journalctl -u nginx --tail 100
```

Nginx should proxy to:

```txt
http://127.0.0.1:3001
```

## GHCR Pull Denied

If GitHub package is private, login once on VPS:

```bash
echo "YOUR_GITHUB_PAT" | docker login ghcr.io -u rahadul789 --password-stdin
```

Token needs:

```txt
read:packages
```

## Docker Config Access Denied On Windows

If Windows shows:

```txt
Error loading config file ... .docker/config.json: Access is denied
```

Usually Docker command still works, but Docker Desktop credential file permission is wrong.

Try:

```powershell
docker logout
docker login
```

If it continues, run terminal as normal user and make sure Docker Desktop is running.

## Fast Status Commands

On VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail 50 app
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```
