#!/usr/bin/env bash
# =============================================================
# Boardupscale — EC2 Production Setup Script
# Tested on: Ubuntu 22.04 / 24.04
# Run as root: sudo bash deploy/setup.sh
# =============================================================
set -euo pipefail

INSTALL_DIR="/opt/boardupscale"
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BOLD}==============================${NC}"
echo -e "${BOLD} Boardupscale Production Setup${NC}"
echo -e "${BOLD}==============================${NC}\n"

# --- Check .env exists ---
if [ ! -f .env ]; then
  echo -e "${RED}ERROR: .env file not found.${NC}"
  echo ""
  echo "  1. Copy the example:  cp .env.production.example .env"
  echo "  2. Fill in all values: nano .env"
  echo "  3. Re-run this script."
  exit 1
fi

echo -e "${YELLOW}[1/3] Installing system dependencies...${NC}"
apt-get update -y -q
apt-get install -y -q curl git openssl

echo -e "${YELLOW}[2/3] Installing Docker...${NC}"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker ubuntu 2>/dev/null || usermod -aG docker ec2-user 2>/dev/null || true
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed: $(docker --version)"
fi

echo -e "${YELLOW}[3/3] Setting up application in ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"
if [ "$(realpath "$(pwd)")" != "$(realpath "$INSTALL_DIR")" ]; then
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.claude' . "$INSTALL_DIR/"
fi
cd "$INSTALL_DIR"

chmod 600 .env

echo -e "${YELLOW}Starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo -e "${GREEN}${BOLD}=============================="
echo " Setup Complete!"
echo -e "==============================${NC}"
echo ""
echo -e " ${BOLD}Web:${NC}      http://localhost:3000"
echo -e " ${BOLD}API:${NC}      http://localhost:4000"
echo -e " ${BOLD}API Docs:${NC} http://localhost:4000/api/docs"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  Logs:      docker compose -f docker-compose.prod.yml logs -f"
echo "  Status:    docker compose -f docker-compose.prod.yml ps"
echo "  Restart:   docker compose -f docker-compose.prod.yml restart"
echo "  Stop:      docker compose -f docker-compose.prod.yml down"
echo "  Update:    git pull && bash deploy/update.sh"
