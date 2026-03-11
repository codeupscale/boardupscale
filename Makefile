.PHONY: setup start stop restart logs build clean dev

setup:
	bash scripts/setup.sh

start:
	docker compose up -d

stop:
	docker compose down

restart:
	docker compose restart

logs:
	docker compose logs -f

build:
	docker compose build

clean:
	docker compose down -v
	docker system prune -f

# Development (with hot reload)
dev:
	docker compose -f docker-compose.yml -f docker-compose.override.yml up

# Individual service logs
logs-api:
	docker compose logs -f api

logs-web:
	docker compose logs -f web

logs-worker:
	docker compose logs -f worker

# Shell into services
shell-api:
	docker compose exec api sh

shell-web:
	docker compose exec web sh

shell-db:
	docker compose exec postgres psql -U boardupscale -d boardupscale
