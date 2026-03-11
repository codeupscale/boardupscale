# Configuration

All configuration is done via environment variables in the `.env` file at the repository root.

```bash
cp .env.example .env
```

---

## Required Variables

These must be set before starting the app in any environment.

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/boardupscale` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_SECRET` | Secret for signing access tokens — **must be changed** | `openssl rand -hex 32` |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens | `openssl rand -hex 32` |

---

## Application Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `4000` | API server port |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend URL (used in email links) |
| `API_URL` | `http://localhost:4000` | API base URL |

---

## Email (SMTP)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | `mailhog` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `SMTP_FROM` | `noreply@boardupscale.com` | From address for all emails |
| `SMTP_SECURE` | `false` | Use TLS (`true` for port 465) |

For production use Gmail, SendGrid, Resend, or any SMTP provider.

---

## File Storage (MinIO / S3)

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIO_ENDPOINT` | `minio` | MinIO/S3 hostname |
| `MINIO_PORT` | `9000` | MinIO/S3 port |
| `MINIO_ACCESS_KEY` | `boardupscale` | Access key |
| `MINIO_SECRET_KEY` | `boardupscale` | Secret key |
| `MINIO_BUCKET` | `boardupscale` | Bucket name |
| `MINIO_USE_SSL` | `false` | Use HTTPS for MinIO |

For AWS S3, point `MINIO_ENDPOINT` to `s3.amazonaws.com` and set your IAM credentials.

---

## Search (Elasticsearch)

| Variable | Default | Description |
|----------|---------|-------------|
| `ELASTICSEARCH_URL` | `http://elasticsearch:9200` | Elasticsearch URL |
| `ELASTICSEARCH_USERNAME` | — | Basic auth username |
| `ELASTICSEARCH_PASSWORD` | — | Basic auth password |

---

## OAuth — Google

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

Create credentials at [console.cloud.google.com](https://console.cloud.google.com). Set the callback URL to `https://your-domain/api/auth/google/callback`.

---

## OAuth — GitHub

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |

Create an OAuth App at [github.com/settings/developers](https://github.com/settings/developers). Set the callback URL to `https://your-domain/api/auth/github/callback`.

---

## SAML SSO

| Variable | Description |
|----------|-------------|
| `SAML_ENTRY_POINT` | IdP SSO URL |
| `SAML_ISSUER` | SP entity ID (your app URL) |
| `SAML_CERT` | IdP signing certificate (base64) |
| `SAML_CALLBACK_URL` | ACS URL — `https://your-domain/api/auth/saml/callback` |

See [SAML SSO](SAML-SSO) for full setup instructions.

---

## GitHub App (Repository Integration)

| Variable | Description |
|----------|-------------|
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM, base64 encoded) |
| `GITHUB_APP_WEBHOOK_SECRET` | Webhook secret for validating payloads |

---

## AI Features

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_ENABLED` | `false` | Enable AI-powered features |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model to use |

---

## Stripe (Billing)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | Stripe price ID for the Pro plan |

Leave unset if you're not using billing.

---

## Telemetry

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEMETRY_ENABLED` | `true` | Send anonymous usage ping on startup |

The ping contains only: anonymous installation ID, version, node version, platform, org count, user count. No PII is ever sent. See [Telemetry](Telemetry) for details.

---

## Enterprise

| Variable | Default | Description |
|----------|---------|-------------|
| `ENTERPRISE_ENABLED` | `false` | Enable enterprise-only features |

Currently all features are available in the Community Edition. This flag is reserved for future enterprise features.
