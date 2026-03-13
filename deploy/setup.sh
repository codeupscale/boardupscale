#!/usr/bin/env bash
# =============================================================
# Boardupscale — EC2 Production Setup Script
# Tested on: Ubuntu 22.04 / 24.04 (t3.medium recommended)
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

# --- Collect configuration ---
read -rp "$(echo -e "${BOLD}Domain${NC} (e.g. board.example.com): ")" DOMAIN
read -rp "$(echo -e "${BOLD}Email${NC} for Let's Encrypt alerts: ")" LE_EMAIL
FRONTEND_URL="https://${DOMAIN}"
echo ""
read -rp "$(echo -e "${BOLD}RDS endpoint${NC} (e.g. boardupscale-production.xxxx.ap-southeast-1.rds.amazonaws.com): ")" RDS_ENDPOINT
read -rsp "$(echo -e "${BOLD}PostgreSQL password${NC} (the RDS master password): ")" PG_PASS; echo
read -rsp "$(echo -e "${BOLD}JWT secret${NC} (32+ chars, or press Enter to auto-generate): ")" JWT_SECRET; echo
if [ -z "$JWT_SECRET" ]; then JWT_SECRET=$(openssl rand -hex 32); echo "  Generated JWT secret."; fi
read -rsp "$(echo -e "${BOLD}JWT refresh secret${NC} (different from above, or press Enter to auto-generate): ")" JWT_REFRESH; echo
if [ -z "$JWT_REFRESH" ]; then JWT_REFRESH=$(openssl rand -hex 32); echo "  Generated JWT refresh secret."; fi
read -rsp "$(echo -e "${BOLD}MinIO access key${NC} (e.g. boardupscale): ")" MINIO_ACCESS; echo
read -rsp "$(echo -e "${BOLD}MinIO secret key${NC} (8+ chars): ")" MINIO_SECRET; echo
echo ""
echo -e "${BOLD}SMTP configuration${NC} (AWS SES recommended)"
read -rp "  SMTP host [email-smtp.us-east-1.amazonaws.com]: " SMTP_HOST
SMTP_HOST=${SMTP_HOST:-email-smtp.us-east-1.amazonaws.com}
read -rp "  SMTP port [587]: " SMTP_PORT
SMTP_PORT=${SMTP_PORT:-587}
read -rp "  SMTP username: " SMTP_USER
read -rsp "  SMTP password: " SMTP_PASS; echo
read -rp "  From address [noreply@${DOMAIN}]: " SMTP_FROM
SMTP_FROM=${SMTP_FROM:-noreply@$DOMAIN}

echo -e "\n${YELLOW}[1/6] Installing system dependencies...${NC}"
apt-get update -y -q
apt-get install -y -q curl git certbot openssl rsync

echo -e "${YELLOW}[2/6] Installing Docker...${NC}"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  # Add ubuntu or ec2-user to docker group
  usermod -aG docker ubuntu 2>/dev/null || usermod -aG docker ec2-user 2>/dev/null || true
  systemctl enable docker
  systemctl start docker
else
  echo "  Docker already installed: $(docker --version)"
fi

echo -e "${YELLOW}[3/6] Setting up application in ${INSTALL_DIR}...${NC}"
mkdir -p "$INSTALL_DIR"
if [ "$(realpath "$(pwd)")" != "$(realpath "$INSTALL_DIR")" ]; then
  rsync -a --exclude='.git' --exclude='node_modules' --exclude='.claude' . "$INSTALL_DIR/"
fi
cd "$INSTALL_DIR"

echo -e "${YELLOW}[4/6] Obtaining SSL certificate for ${DOMAIN}...${NC}"
echo "  Ensure port 80 is open in your EC2 Security Group."
certbot certonly --standalone --non-interactive --agree-tos \
  -m "$LE_EMAIL" -d "$DOMAIN" || {
  echo -e "${RED}ERROR: certbot failed.${NC}"
  echo "  Check that:"
  echo "   - Port 80 is open in your EC2 Security Group (inbound)"
  echo "   - DNS A record for ${DOMAIN} resolves to this server's IP"
  exit 1
}

echo -e "${YELLOW}[5/6] Writing .env...${NC}"
cp .env.production.example .env
sed -i "s|REPLACE_DOMAIN|${DOMAIN}|g"                                        .env
sed -i "s|REPLACE_RDS_ENDPOINT|${RDS_ENDPOINT}|g"                           .env
sed -i "s|CHANGE_THIS_STRONG_PASSWORD|${PG_PASS}|g"                          .env
sed -i "s|CHANGE_THIS_LONG_RANDOM_SECRET_32_CHARS_MIN|${JWT_SECRET}|g"       .env
sed -i "s|CHANGE_THIS_ANOTHER_LONG_RANDOM_SECRET|${JWT_REFRESH}|g"           .env
sed -i "s|CHANGE_THIS_MINIO_ACCESS_KEY|${MINIO_ACCESS}|g"                    .env
sed -i "s|CHANGE_THIS_MINIO_SECRET_KEY|${MINIO_SECRET}|g"                    .env
sed -i "s|YOUR_SES_SMTP_USERNAME|${SMTP_USER}|g"                             .env
sed -i "s|YOUR_SES_SMTP_PASSWORD|${SMTP_PASS}|g"                             .env
sed -i "s|^SMTP_HOST=.*|SMTP_HOST=${SMTP_HOST}|"                             .env
sed -i "s|^SMTP_PORT=.*|SMTP_PORT=${SMTP_PORT}|"                             .env
sed -i "s|^SMTP_FROM=.*|SMTP_FROM=${SMTP_FROM}|"                             .env
chmod 600 .env

# Patch nginx config with domain for cert path
sed -i "s|REPLACE_DOMAIN|${DOMAIN}|g" services/nginx/nginx.prod.conf

echo -e "${YELLOW}[6/6] Building and starting services...${NC}"
docker compose -f docker-compose.prod.yml up -d --build

# Auto-renew SSL certificate
echo "0 3 * * * root certbot renew --quiet && docker compose -f ${INSTALL_DIR}/docker-compose.prod.yml restart nginx" \
  > /etc/cron.d/boardupscale-certbot

echo ""
echo -e "${GREEN}${BOLD}=============================="
echo " Setup Complete!"
echo -e "==============================${NC}"
echo ""
echo -e " ${BOLD}App:${NC}      https://${DOMAIN}"
echo -e " ${BOLD}API:${NC}      https://${DOMAIN}/api"
echo -e " ${BOLD}API Docs:${NC} https://${DOMAIN}/api/docs"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo ""
echo -e "  1. ${BOLD}To update the app${NC} after a code push:"
echo -e "     cd ${INSTALL_DIR} && git pull && bash deploy/update.sh"
echo ""
echo -e "${BOLD}Useful commands:${NC}"
echo "  Logs:      docker compose -f docker-compose.prod.yml logs -f"
echo "  Status:    docker compose -f docker-compose.prod.yml ps"
echo "  Restart:   docker compose -f docker-compose.prod.yml restart"
echo "  Stop:      docker compose -f docker-compose.prod.yml down"
