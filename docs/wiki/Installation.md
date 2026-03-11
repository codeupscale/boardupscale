# Installation

Boardupscale runs entirely in Docker. A single command starts all services.

## Requirements

- **Docker** 24+
- **Docker Compose** v2 (`docker compose` — not `docker-compose`)
- 2 GB RAM minimum (4 GB recommended for Elasticsearch)
- Linux, macOS, or Windows (WSL2)

---

## Quick Start (5 minutes)

```bash
# 1. Clone the repository
git clone https://github.com/codeupscale/boardupscale.git
cd boardupscale

# 2. Configure environment
cp .env.example .env
# Open .env and set JWT_SECRET to a long random string:
#   openssl rand -hex 32
nano .env

# 3. Start all services
docker compose up -d

# 4. Open the app
open http://localhost:8091
```

> **First run takes ~2 minutes** while Docker pulls images and the database initialises automatically.

---

## Services Started

| Service | Description | Default Port |
|---------|-------------|-------------|
| **nginx** | Reverse proxy (entry point) | 8091 |
| **api** | NestJS REST API + WebSocket | 4000 (internal) |
| **web** | React SPA | 3000 (internal) |
| **worker** | BullMQ background processor | — |
| **postgres** | PostgreSQL 15 | 5432 |
| **redis** | Cache + job queue + pub/sub | 6379 |
| **elasticsearch** | Full-text search | 9200 |
| **minio** | File storage (S3-compatible) | 9000 / 9001 |
| **mailhog** | Email preview (dev only) | 8026 |

---

## First Boot

On first start, the API automatically:
1. Runs all TypeORM migrations (creates all tables)
2. Seeds the database with default roles and permissions

You don't need to run any database commands manually.

---

## Create Your First Account

1. Navigate to `http://localhost:8091`
2. Click **Register**
3. Fill in your name, email, and password
4. This creates the first **organization** and makes you the **Admin**
5. You're in — create your first project from the dashboard

---

## Updating

See [Upgrading](Upgrading) for how to pull new versions without data loss.

---

## Troubleshooting

### App not loading

```bash
# Check if all containers are running
docker compose ps

# Check logs for errors
docker compose logs api --tail=50
docker compose logs web --tail=50
```

### Port conflict

If port 8091 is already in use, change `NGINX_PORT` in your `.env`:

```env
NGINX_PORT=8080
```

### Elasticsearch not starting

Elasticsearch requires at least 1 GB of virtual memory:

```bash
# Linux only
sudo sysctl -w vm.max_map_count=262144

# Make it permanent
echo "vm.max_map_count=262144" | sudo tee -a /etc/sysctl.conf
```

### Database already exists

If you're re-running after a failed first boot:

```bash
docker compose down -v   # removes volumes — WARNING: deletes all data
docker compose up -d
```
