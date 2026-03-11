#!/bin/bash
set -e

echo "🚀 Setting up Boardupscale..."

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker Desktop."
  exit 1
fi

if ! command -v docker compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo "❌ Docker Compose is not available."
  exit 1
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
  cp .env.example .env
  # Generate a random JWT secret
  JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
  sed -i.bak "s/change-this-to-a-long-random-secret/$JWT_SECRET/" .env
  rm -f .env.bak
  echo "✅ Created .env from .env.example"
fi

echo "📦 Starting all services with Docker Compose..."
docker compose up -d --build

echo "⏳ Waiting for services to be healthy..."
sleep 15

echo "🪣 Creating MinIO bucket..."
docker compose exec -T minio mc alias set local http://localhost:9000 minioadmin minioadmin 2>/dev/null || true
docker compose exec minio sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/boardupscale --ignore-existing" 2>/dev/null || true

echo ""
echo "✅ Boardupscale is running!"
echo ""
echo "  🌐 App:       http://localhost"
echo "  📖 API Docs:  http://localhost/api/docs"
echo "  🗄️  MinIO:     http://localhost:9001 (minioadmin/minioadmin)"
echo "  📧 MailHog:   http://localhost:8025"
echo ""
echo "To stop: docker compose down"
echo "To view logs: docker compose logs -f"
