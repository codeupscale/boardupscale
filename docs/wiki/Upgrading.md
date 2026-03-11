# Upgrading

Boardupscale follows **semantic versioning**. Database migrations run automatically on startup — you never need to run SQL manually.

---

## Standard Upgrade (Docker Compose)

```bash
cd /path/to/boardupscale

# 1. Pull the latest code
git pull origin main

# 2. Pull new Docker images
docker compose pull

# 3. Restart with zero-downtime rolling update
docker compose up -d --no-deps --build api web worker

# 4. Verify the upgrade
docker compose ps
docker compose logs api --tail=20
```

Migrations run automatically when the API container restarts.

---

## Upgrade Script

Use the included update script for convenience:

```bash
bash deploy/update.sh
```

This script:
1. Pulls latest code from `main`
2. Pulls new Docker images
3. Restarts services
4. Tails logs to confirm a healthy start

---

## Checking the Current Version

```bash
docker compose exec api node -e "console.log(process.env.npm_package_version)"
# or
curl http://localhost:4000/api/health | jq .version
```

---

## Checking for Updates

Watch the [GitHub Releases](https://github.com/codeupscale/boardupscale/releases) page for new versions and changelogs.

Star the repo to get notified of releases.

---

## Before Upgrading

1. **Take a backup** — see [Backup & Restore](Backup-and-Restore)
2. **Read the release notes** — check the [CHANGELOG](https://github.com/codeupscale/boardupscale/blob/main/CHANGELOG.md) for breaking changes
3. **Check migration notes** — major versions may have database migration requirements

---

## Rolling Back

If an upgrade causes issues:

```bash
# Revert to the previous git commit
git log --oneline -5          # find the previous version tag
git checkout v1.0.0           # roll back to that tag

# Restart with the old images
docker compose up -d --no-deps api web worker
```

> **Note:** If the new version ran database migrations, you may need to run `npm run migration:revert` inside the API container before rolling back to ensure schema compatibility.

---

## Major Version Upgrades

Major versions (e.g. 1.x → 2.x) may have breaking changes. Always read the release notes and follow the migration guide included with the release before upgrading.
