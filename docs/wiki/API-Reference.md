# API Reference

Boardupscale exposes a full REST API. All endpoints are prefixed with `/api`.

---

## Interactive Docs

Swagger UI is available at:

```
http://localhost:4000/api/docs
```

Or in production: `https://your-domain/api/docs`

All endpoints are documented with request/response schemas, authentication requirements, and example payloads.

---

## Authentication

### Getting a Token

```bash
curl -X POST https://your-domain/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'
```

Response:
```json
{
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": { "id": "...", "email": "you@example.com", ... }
  }
}
```

### Using the Token

Include the access token in the `Authorization` header:

```bash
curl https://your-domain/api/issues \
  -H "Authorization: Bearer eyJhbGci..."
```

### Refreshing the Token

Access tokens expire after 15 minutes. Refresh with:

```bash
curl -X POST https://your-domain/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJhbGci..."}'
```

### API Keys

For server-to-server integrations, use an API key instead of JWT:

```bash
curl https://your-domain/api/issues \
  -H "X-API-Key: bu_your_api_key_here"
```

Generate API keys in **User Settings → API Keys**.

---

## Response Format

All responses follow this envelope:

```json
{
  "data": { ... }
}
```

Paginated responses:

```json
{
  "data": [ ... ],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 50
  }
}
```

Errors:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "must be a valid email" }
  ]
}
```

---

## Key Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register a new user + org |
| POST | `/auth/login` | Login with email + password |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/logout` | Logout (revoke refresh token) |
| GET | `/auth/me` | Get current user |
| POST | `/auth/forgot-password` | Request password reset |
| POST | `/auth/reset-password` | Reset password with token |

### Issues
| Method | Path | Description |
|--------|------|-------------|
| GET | `/issues` | List issues (filterable) |
| POST | `/issues` | Create an issue |
| GET | `/issues/:id` | Get issue detail |
| PATCH | `/issues/:id` | Update an issue |
| DELETE | `/issues/:id` | Soft-delete an issue |
| GET | `/issues/:id/comments` | List comments |
| POST | `/issues/:id/comments` | Add a comment |
| GET | `/issues/:id/activity` | Get activity stream |
| POST | `/issues/:id/work-logs` | Log time |
| GET | `/issues/:id/work-logs` | Get work logs |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/projects` | List all projects |
| POST | `/projects` | Create a project |
| GET | `/projects/:id` | Get project detail |
| PATCH | `/projects/:id` | Update a project |
| DELETE | `/projects/:id` | Delete a project |
| GET | `/projects/:id/members` | List members |
| POST | `/projects/:id/members` | Add a member |

### Boards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards/:projectId` | Get board config |
| PATCH | `/boards/:projectId/statuses/:id` | Update a status column |
| POST | `/boards/:projectId/statuses` | Add a status column |

### Sprints
| Method | Path | Description |
|--------|------|-------------|
| GET | `/sprints?projectId=` | List sprints |
| POST | `/sprints` | Create a sprint |
| PATCH | `/sprints/:id` | Update a sprint |
| POST | `/sprints/:id/start` | Start a sprint |
| POST | `/sprints/:id/complete` | Complete a sprint |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/search?q=&projectId=` | Full-text search |

### Organisations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/organizations/current` | Get current org |
| PATCH | `/organizations/current` | Update org settings |
| GET | `/organizations/members` | List members |
| POST | `/organizations/invite` | Invite a member |
| DELETE | `/organizations/members/:id` | Remove a member |

---

## Pagination

All list endpoints support pagination via query parameters:

```
GET /api/issues?page=1&limit=50
```

| Parameter | Default | Max | Description |
|-----------|---------|-----|-------------|
| `page` | `1` | — | Page number (1-based) |
| `limit` | `50` | `200` | Results per page |

---

## Filtering Issues

```
GET /api/issues?projectId=&status=&assigneeId=&priority=&sprint=&label=&search=
```

| Parameter | Description |
|-----------|-------------|
| `projectId` | Filter by project |
| `status` | Filter by status name |
| `assigneeId` | Filter by assignee user ID |
| `priority` | `critical`, `high`, `medium`, `low` |
| `sprintId` | Filter by sprint ID |
| `label` | Filter by label |
| `search` | Full-text search on title + description |
| `type` | `epic`, `story`, `task`, `bug`, `subtask` |

---

## Rate Limits

Strict rate limits apply to auth endpoints:

| Endpoint | Limit |
|----------|-------|
| `POST /auth/login` | 10 requests / 15 min per IP |
| `POST /auth/register` | 5 requests / hour per IP |
| `POST /auth/forgot-password` | 5 requests / hour per IP |
| All other endpoints | 1000 requests / min per user |

Rate limit headers are returned on every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
