# Production Deployment

Deploy Boardupscale on a VPS (DigitalOcean, Hetzner, Linode, AWS EC2, etc.) with SSL.

---

## Minimum Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

> Elasticsearch is the largest memory consumer (~1.5 GB). If RAM is limited, reduce `ES_JAVA_OPTS` in `docker-compose.prod.yml`.

---

## Quick Deploy Script

```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/codeupscale/boardupscale/main/deploy/setup.sh | bash
```

This script:
1. Installs Docker and Docker Compose
2. Clones the repository
3. Prompts for your domain and generates a `.env`
4. Sets up SSL with Let's Encrypt (Certbot)
5. Starts all services

---

## Manual Setup

### 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Clone and Configure

```bash
git clone https://github.com/codeupscale/boardupscale.git
cd boardupscale
cp .env.production.example .env
nano .env
```

Required changes in `.env`:

```env
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
API_URL=https://your-domain.com/api
JWT_SECRET=<64-char random string>
JWT_REFRESH_SECRET=<64-char random string>
DATABASE_URL=postgresql://boardupscale:<strong-password>@postgres:5432/boardupscale
POSTGRES_PASSWORD=<strong-password>
REDIS_URL=redis://redis:6379
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@your-domain.com
```

Generate secure secrets:
```bash
openssl rand -hex 32  # run twice — once for JWT_SECRET, once for JWT_REFRESH_SECRET
```

### 3. Configure Nginx for Your Domain

Edit `services/nginx/nginx.prod.conf` and replace `your-domain.com` with your actual domain.

### 4. SSL with Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain certificate (before starting containers)
sudo certbot certonly --standalone -d your-domain.com

# Certificates will be at:
# /etc/letsencrypt/live/your-domain.com/fullchain.pem
# /etc/letsencrypt/live/your-domain.com/privkey.pem
```

Update `docker-compose.prod.yml` to mount the certificates into Nginx.

### 5. Start in Production Mode

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 6. Check Logs

```bash
docker compose logs -f --tail=50
```

---

## Automatic SSL Renewal

```bash
# Add to crontab (runs twice daily)
sudo crontab -e

0 12 * * * /usr/bin/certbot renew --quiet && docker compose -C /path/to/boardupscale exec nginx nginx -s reload
```

---

## Firewall

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP (redirect to HTTPS)
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

Do NOT expose ports 4000 (API), 3000 (web), 5432 (postgres), 6379 (redis), or 9200 (elasticsearch) directly — they are accessible only through Nginx.

---

## Environment-Specific Settings

In production, also set:

```env
TELEMETRY_ENABLED=true    # anonymous usage ping (opt-out anytime)
MINIO_USE_SSL=false        # set to true if using external S3
```

For AWS S3 instead of MinIO:

```env
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
MINIO_SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
MINIO_BUCKET=your-bucket-name
MINIO_USE_SSL=true
```

---

## Backup & Restore

See [Backup and Restore](Backup-and-Restore) for automated backup scripts.

---

## Monitoring

Boardupscale exposes a health check endpoint:

```
GET /api/health
```

Returns `200 OK` with service statuses when all systems are healthy. Use this with your uptime monitor (UptimeRobot, BetterUptime, etc.).
