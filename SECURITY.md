# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (`main`) | ✅ Active security fixes |
| Previous minor | ⚠️ Critical fixes only |
| Older releases | ❌ Not supported |

---

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, pull requests, or Discussions.** Public disclosure before a fix is available puts all Boardupscale users at risk.

### How to Report

Send an email to **security@YOUR_DOMAIN.com** with:

- A clear description of the vulnerability
- Steps to reproduce (proof-of-concept code or screenshots if possible)
- The potential impact (what an attacker could achieve)
- Your suggested fix, if you have one (optional but appreciated)

You will receive an acknowledgement within **48 hours** and a full response within **7 days**.

### What to Expect

1. **Acknowledgement** — we confirm receipt within 48 hours
2. **Triage** — we assess severity using [CVSS v3.1](https://www.first.org/cvss/calculator/3.1) within 7 days
3. **Fix** — we develop and test a patch (timeline depends on complexity)
4. **Coordinated disclosure** — we notify you before publishing a fix so you can verify it
5. **Credit** — we publicly credit you in the release notes unless you prefer to remain anonymous

### Scope

**In scope:**
- Authentication and authorisation bypasses
- SQL injection, command injection, SSRF, XXE
- Cross-site scripting (XSS) and CSRF
- Insecure direct object references (IDOR) allowing cross-tenant data access
- Sensitive data exposure (credentials, tokens, PII)
- Remote code execution

**Out of scope:**
- Denial-of-service attacks requiring significant infrastructure resources
- Self-XSS (requires the attacker to inject into their own session only)
- Issues in third-party dependencies — report directly to the dependency maintainer, then notify us
- Rate limiting on non-sensitive endpoints
- Missing security headers that do not represent a realistic attack vector

---

## Security Best Practices for Self-Hosters

If you are running Boardupscale yourself, please follow these guidelines:

- **Change `JWT_SECRET`** to a cryptographically random value of at least 64 characters before going to production
- **Run behind HTTPS** — use a reverse proxy (Nginx, Caddy, Traefik) with a valid TLS certificate
- **Restrict network access** — PostgreSQL, Redis, Elasticsearch, and MinIO should never be exposed to the public internet
- **Enable Dependabot** on your fork to receive automated dependency updates
- **Back up your PostgreSQL volume** regularly
- **Rotate OAuth client secrets** periodically
- **Use strong passwords** for `POSTGRES_PASSWORD` and `MINIO_SECRET_KEY` in production

---

## Responsible Disclosure

We follow a **90-day disclosure policy**. If a fix is not available within 90 days of your initial report, you are free to disclose the vulnerability publicly, with reasonable advance notice to us.

We will not pursue legal action against researchers who:
- Report vulnerabilities in good faith
- Do not exploit the vulnerability beyond what is needed to demonstrate it
- Do not access, modify, or delete other users' data
- Do not disrupt service availability

Thank you for helping keep Boardupscale and its users safe. 🙏
