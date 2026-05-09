# Production Checklist

এই checklist follow করলে project-ta learning lab থেকে stronger production setup-এর দিকে যাবে।

## Already Done

- Dockerfile with production dependency install
- Non-root app user in container
- Express security middleware with Helmet
- Request logging with Pino
- Request id support
- Health and readiness endpoints
- Prometheus metrics
- Grafana dashboard
- Loki logs
- GitHub Actions CI
- GitHub Actions CD
- GHCR Docker image registry
- VPS deployment through SSH
- Nginx reverse proxy
- Production monitoring ports private on `127.0.0.1`

## Must Do Before Real Public Launch

- Buy or connect a domain
- Add DNS `A` record to VPS IP
- Enable HTTPS with Let's Encrypt
- Set strong Grafana password
- Confirm chaos routes are disabled in production
- Confirm `.env` is not committed
- Configure UFW firewall
- Check MongoDB Atlas Network Access
- Add backup/restore strategy
- Add alerting
- Plan rollback

## Firewall

Basic UFW example:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not open these publicly unless you have a strong reason:

- `3001` app internal port
- `3002` Grafana
- `9090` Prometheus
- `3100` Loki

## HTTPS When Domain Is Ready

Install Certbot:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

After DNS points to VPS:

```bash
sudo certbot --nginx -d yourdomain.com
```

Renewal check:

```bash
sudo certbot renew --dry-run
```

## Secrets

Keep these only in VPS `.env` or GitHub Secrets:

- MongoDB URI
- Grafana password
- SSH private key
- GitHub PAT if GHCR package is private

Never commit:

- `.env`
- private SSH keys
- production passwords
- database credentials

## MongoDB Atlas

Checklist:

- Database user has limited permissions
- Strong password
- VPS IP allowed in Network Access
- Local IP only allowed when needed
- Connection string includes database name
- Backup enabled if this becomes real data

## Grafana

Checklist:

- Strong admin password
- Sign up disabled
- Public internet access blocked
- Access through SSH tunnel
- Datasources provisioned
- Dashboard loads data

Reset password:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml exec grafana grafana cli admin reset-admin-password "YourStrongPassword123!"
```

## Monitoring And Alerts

Recommended alert ideas:

- App readiness down
- HTTP 5xx error rate high
- p95 latency too high
- MongoDB readiness down
- container restart count high
- disk usage high
- memory usage high

This project has metrics and dashboards. Alerting can be added next with Grafana alerts or Prometheus Alertmanager.

## Backups

For real production:

- MongoDB Atlas automated backups
- VPS `/opt/node-observability-lab/.env` backup in secure password manager
- Grafana dashboard JSON kept in git
- Document restore steps

## Rollback

Basic manual rollback:

```bash
cd /opt/node-observability-lab
APP_IMAGE=ghcr.io/rahadul789/cicd:<old-commit-sha> docker compose -f compose.prod.yml up -d
curl http://127.0.0.1:3001/health/ready
```

For real production, automate rollback after failed health check.

## Final Production Confidence Check

Run on VPS:

```bash
cd /opt/node-observability-lab
docker compose -f compose.prod.yml ps
curl http://127.0.0.1:3001/health/ready
curl http://127.0.0.1:9090/-/ready
curl http://127.0.0.1:3002/api/health
curl http://127.0.0.1:3100/ready
```

Run from your computer:

```bash
curl http://72.60.219.174/health/ready
ssh -L 3002:127.0.0.1:3002 deploy@72.60.219.174
```

Then open:

```txt
http://localhost:3002
```
