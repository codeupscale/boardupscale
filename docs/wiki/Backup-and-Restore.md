# Backup & Restore

Regular backups protect your data. Boardupscale stores data in two places:
- **PostgreSQL** — all structured data (issues, comments, users, projects, etc.)
- **MinIO** — file attachments and images

---

## Automated Backup Script

Create a cron job to run backups daily:

```bash
# Create backup script
cat > /opt/boardupscale-backup.sh << 'EOF'
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/boardupscale"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup..."

# Backup PostgreSQL
docker compose -f /opt/boardupscale/docker-compose.yml exec -T postgres \
  pg_dump -U boardupscale boardupscale | gzip > "$BACKUP_DIR/postgres_$DATE.sql.gz"

echo "[$(date)] PostgreSQL backup complete: postgres_$DATE.sql.gz"

# Backup MinIO (file attachments)
docker compose -f /opt/boardupscale/docker-compose.yml run --rm \
  -e MC_HOST_local=http://boardupscale:boardupscale@minio:9000 \
  --entrypoint mc minio/mc \
  mirror local/boardupscale "$BACKUP_DIR/minio_$DATE/" --quiet

echo "[$(date)] MinIO backup complete"

# Delete old backups
find "$BACKUP_DIR" -name "postgres_*.sql.gz" -mtime +$RETENTION_DAYS -delete
find "$BACKUP_DIR" -name "minio_*" -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} +

echo "[$(date)] Backup finished. Retained last $RETENTION_DAYS days."
EOF

chmod +x /opt/boardupscale-backup.sh
```

Add to cron (daily at 2 AM):

```bash
sudo crontab -e
# Add this line:
0 2 * * * /opt/boardupscale-backup.sh >> /var/log/boardupscale-backup.log 2>&1
```

---

## Manual PostgreSQL Backup

```bash
# Create backup
docker compose exec postgres pg_dump -U boardupscale boardupscale > backup.sql

# Compressed backup
docker compose exec postgres pg_dump -U boardupscale boardupscale | gzip > backup_$(date +%Y%m%d).sql.gz
```

---

## Restoring PostgreSQL

```bash
# Stop the API and worker to prevent writes during restore
docker compose stop api worker

# Drop and recreate the database
docker compose exec postgres psql -U boardupscale -c "DROP DATABASE boardupscale;"
docker compose exec postgres psql -U boardupscale -c "CREATE DATABASE boardupscale;"

# Restore from backup
gunzip -c backup_20260311.sql.gz | docker compose exec -T postgres psql -U boardupscale boardupscale

# Restart services
docker compose start api worker
```

---

## Backing Up to S3

For offsite backups, sync to AWS S3 or any S3-compatible storage after creating the local backup:

```bash
# Install AWS CLI
sudo apt install awscli -y

# Add to backup script after local backup:
aws s3 cp "$BACKUP_DIR/postgres_$DATE.sql.gz" s3://your-bucket/boardupscale/postgres_$DATE.sql.gz
aws s3 sync "$BACKUP_DIR/minio_$DATE/" s3://your-bucket/boardupscale/minio_$DATE/
```

---

## Migrating to a New Server

### On the old server:
```bash
# Backup
docker compose exec postgres pg_dump -U boardupscale boardupscale | gzip > boardupscale_migration.sql.gz
# Copy MinIO data
docker run --rm --volumes-from boardupscale-minio-1 -v $(pwd):/backup ubuntu tar czf /backup/minio_data.tar.gz /data
```

### Transfer files:
```bash
scp boardupscale_migration.sql.gz minio_data.tar.gz user@new-server:/opt/boardupscale/
```

### On the new server:
```bash
# Set up Boardupscale (follow Installation guide)
git clone https://github.com/codeupscale/boardupscale.git
cp .env.example .env
# Configure .env

# Start only infrastructure
docker compose up postgres minio redis -d

# Restore PostgreSQL
gunzip -c boardupscale_migration.sql.gz | docker compose exec -T postgres psql -U boardupscale boardupscale

# Restore MinIO data
docker run --rm --volumes-from boardupscale-minio-1 -v $(pwd):/backup ubuntu tar xzf /backup/minio_data.tar.gz

# Start everything
docker compose up -d
```
