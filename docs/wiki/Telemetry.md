# Telemetry

Boardupscale sends a single anonymous ping to `telemetry.boardupscale.com` on startup.

---

## What Is Collected

| Field | Value | Example |
|-------|-------|---------|
| `installationId` | One-way SHA-256 hash of your oldest org's UUID (first 16 hex chars). Cannot be reversed to your org ID. | `a3f2c891d45b6e70` |
| `version` | npm package version | `1.0.0` |
| `nodeVersion` | Node.js runtime version | `v20.11.0` |
| `platform` | OS platform | `linux` |
| `orgCount` | Total number of organisations | `2` |
| `userCount` | Total number of active users | `14` |

---

## What Is NOT Collected

- No names, emails, or any personally identifiable information (PII)
- No issue content, project names, or organisation names
- No IP addresses
- No usage patterns or page views
- No file content

---

## Why We Collect This

We use aggregate telemetry to:
- Understand which Node.js and platform versions are most common (helps prioritise testing)
- Track total installations and active user counts over time
- Make informed decisions about what to support and deprecate

---

## How to Opt Out

Set `TELEMETRY_ENABLED=false` in your `.env` file and restart the API:

```env
TELEMETRY_ENABLED=false
```

```bash
docker compose restart api
```

You'll see this in the logs on startup:

```
[TelemetryService] Telemetry is disabled (TELEMETRY_ENABLED=false)
```

---

## Technical Details

- The ping is fired once on startup (not on every request)
- It is completely **fire-and-forget** — if the request fails or times out, the API starts normally
- Timeout: 5 seconds
- The telemetry endpoint only accepts POST requests from Boardupscale
- No data is sold or shared with third parties
