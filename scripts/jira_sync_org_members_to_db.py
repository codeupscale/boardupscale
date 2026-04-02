#!/usr/bin/env python3
"""
Jira Cloud → Boardupscale PostgreSQL: sync site members into `users` for one organization.

Schema (see services/api InitialSchema migration):
  - Members are `users` rows with `organization_id` = target org UUID (no separate org_members table).
  - Invited-style rows: password_hash NULL, is_active false, email_verified false (same shape as invite flow).
  - Dedupe: unique `email` globally; `oauth_provider` + `oauth_id` stores Jira `accountId`.

Required env:
  JIRA_URL, JIRA_USERNAME, JIRA_API_TOKEN
  DATABASE_URL  (postgresql://...)
  BOARDUPSCALE_ORG_ID  (UUID of the Boardupscale organization)

Optional env:
  JIRA_MEMBERS_GROUP_NAME   default: jira-software-users-codeupscale
  JIRA_SITE_ADMINS_GROUP_NAME  default: site-admins  (members get role `admin`; others `member`)

Examples:
  pip install -r scripts/requirements-jira-sync.txt
  export DATABASE_URL=postgresql://user:pass@localhost:5433/boardupscale
  export BOARDUPSCALE_ORG_ID=edebd4d2-469e-45ec-8a04-122eebc2f244
  export JIRA_URL=https://codeupscale.atlassian.net JIRA_USERNAME=... JIRA_API_TOKEN=...
  python3 scripts/jira_sync_org_members_to_db.py --dry-run
  python3 scripts/jira_sync_org_members_to_db.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass
from typing import Any

try:
    import psycopg2
except ImportError:
    print(
        "Missing dependency: pip install psycopg2-binary   "
        "(or: pip install -r scripts/requirements-jira-sync.txt)",
        file=sys.stderr,
    )
    raise SystemExit(1)


# ── Jira HTTP ───────────────────────────────────────────────────────────────


def jira_auth_header() -> str:
    user = os.environ.get("JIRA_USERNAME", "")
    token = os.environ.get("JIRA_API_TOKEN", "")
    if not user or not token:
        raise SystemExit("JIRA_USERNAME and JIRA_API_TOKEN must be set")
    raw = f"{user}:{token}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def jira_get(path: str, retries: int = 6, timeout: float = 45.0) -> Any:
    base = os.environ["JIRA_URL"].rstrip("/")
    last: Exception | None = None
    for attempt in range(retries):
        req = urllib.request.Request(
            base + path,
            headers={"Accept": "application/json", "Authorization": jira_auth_header()},
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace") if e.fp else ""
            if e.code == 429 and attempt < retries - 1:
                wait = min(120, (2**attempt) + random.uniform(0, 2))
                time.sleep(wait)
                continue
            if e.code >= 500 and attempt < retries - 1:
                time.sleep(min(30, 2**attempt))
                continue
            last = RuntimeError(f"Jira HTTP {e.code}: {body[:800]}")
        except urllib.error.URLError as e:
            last = e
            if attempt < retries - 1:
                time.sleep(min(30, 2**attempt))
                continue
            raise
    raise last or RuntimeError("Jira request failed")


def fetch_group_members_paginated(group_name: str) -> list[dict[str, Any]]:
    """Return raw Jira user objects from GET /rest/api/3/group/member."""
    out: list[dict[str, Any]] = []
    start = 0
    page_size = 50
    while True:
        q = urllib.parse.urlencode(
            {
                "groupname": group_name,
                "includeInactiveUsers": "true",
                "startAt": start,
                "maxResults": page_size,
            }
        )
        data = jira_get(f"/rest/api/3/group/member?{q}")
        if not isinstance(data, dict):
            break
        values = data.get("values") or []
        for v in values:
            if isinstance(v, dict):
                out.append(v)
        if not values:
            break
        total = data.get("total")
        if isinstance(total, int) and start + len(values) >= total:
            break
        if data.get("isLast") is True:
            break
        if len(values) < page_size:
            break
        start += len(values)
        if start > 200000:
            break
    return out


def fetch_jira_user(account_id: str) -> dict[str, Any] | None:
    aid = urllib.parse.quote(account_id, safe="")
    try:
        # Short timeout: many sequential lookups; one slow response must not block minutes.
        u = jira_get(f"/rest/api/3/user?accountId={aid}", retries=2, timeout=20.0)
        return u if isinstance(u, dict) else None
    except Exception:
        return None


@dataclass
class NormalizedMember:
    account_id: str
    email: str
    display_name: str
    avatar_url: str | None
    account_type: str
    is_site_admin: bool


def normalize_email(e: str | None) -> str | None:
    if not e or not isinstance(e, str):
        return None
    e = e.strip().lower()
    return e if e else None


def pick_avatar(u: dict[str, Any]) -> str | None:
    av = u.get("avatarUrls") or {}
    if isinstance(av, dict):
        return av.get("48x48") or av.get("32x32") or next(iter(av.values()), None)
    return None


def build_member_rows(
    raw_group: list[dict[str, Any]],
    site_admin_ids: set[str],
    include_apps: bool,
) -> list[NormalizedMember]:
    """Enrich group entries; filter to importable accounts."""
    by_aid: dict[str, dict[str, Any]] = {}
    for row in raw_group:
        aid = row.get("accountId")
        if not aid:
            continue
        by_aid[str(aid)] = row

    enriched: dict[str, dict[str, Any]] = {}
    n = len(by_aid)
    for idx, (aid, row) in enumerate(by_aid.items(), start=1):
        if idx % 5 == 0 or idx == 1 or idx == n:
            print(f"  Enriching {idx}/{n} …", flush=True)
        atype = (row.get("accountType") or "").strip() or "unknown"
        if not include_apps and atype and atype != "atlassian":
            continue
        email = normalize_email(row.get("emailAddress"))
        display = (row.get("displayName") or "").strip() or None
        # Only call Jira when email is missing from group payload (avoids N+1 for typical users).
        if not email:
            full = fetch_jira_user(aid)
            time.sleep(0.05)
            if full:
                email = normalize_email(full.get("emailAddress"))
                display = display or (full.get("displayName") or "").strip() or None
                atype = (full.get("accountType") or atype).strip()
                if not row.get("avatarUrls") and full.get("avatarUrls"):
                    row = dict(row)
                    row["avatarUrls"] = full["avatarUrls"]
        if not display:
            display = email.split("@")[0] if email else f"jira-{aid[:12]}"
        enriched[aid] = {**row, "_resolved_email": email, "_resolved_name": display, "_atype": atype}

    results: list[NormalizedMember] = []
    for aid, row in enriched.items():
        atype = row.get("_atype", "unknown")
        if not include_apps and atype != "atlassian":
            continue
        email = normalize_email(row.get("_resolved_email"))
        if not email:
            continue
        display = (row.get("_resolved_name") or email.split("@")[0]).strip()[:255]
        if len(display) < 1:
            display = email.split("@")[0][:255]
        av = pick_avatar(row)
        results.append(
            NormalizedMember(
                account_id=aid,
                email=email,
                display_name=display,
                avatar_url=av[:2000] if isinstance(av, str) else None,
                account_type=atype,
                is_site_admin=aid in site_admin_ids,
            )
        )
    return results


# ── DB ───────────────────────────────────────────────────────────────────────


def connect_db():
    url = os.environ.get("DATABASE_URL") or os.environ.get("POSTGRES_URL")
    if not url:
        raise SystemExit("DATABASE_URL (or POSTGRES_URL) must be set")
    return psycopg2.connect(url)


def ensure_org(cur, org_id: str) -> str:
    cur.execute("SELECT name FROM organizations WHERE id = %s::uuid", (org_id,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"Organization not found in DB: {org_id}")
    return row[0]


def sync_members(
    cur,
    org_id: str,
    members: list[NormalizedMember],
    dry_run: bool,
) -> dict[str, int]:
    stats = {
        "inserted": 0,
        "updated": 0,
        "skipped_cross_org": 0,
        "skipped_owner": 0,
        "unchanged": 0,
    }

    for m in members:
        role = "admin" if m.is_site_admin else "member"

        cur.execute(
            """
            SELECT id, organization_id, role
            FROM users
            WHERE email = %s
            """,
            (m.email,),
        )
        existing = cur.fetchone()

        if existing:
            uid, existing_org, existing_role = existing[0], existing[1], existing[2]
            if existing_org is None or str(existing_org) != org_id:
                stats["skipped_cross_org"] += 1
                continue
            if existing_role == "owner":
                stats["skipped_owner"] += 1
                continue
            if dry_run:
                stats["updated"] += 1
                continue
            cur.execute(
                """
                UPDATE users SET
                  display_name = %s,
                  avatar_url = COALESCE(%s, avatar_url),
                  oauth_provider = 'jira',
                  oauth_id = %s,
                  role = CASE WHEN role = 'owner' THEN role ELSE %s END,
                  updated_at = now()
                WHERE id = %s::uuid AND organization_id = %s::uuid
                """,
                (m.display_name, m.avatar_url, m.account_id, role, uid, org_id),
            )
            if cur.rowcount:
                stats["updated"] += 1
            else:
                stats["unchanged"] += 1
            continue

        if dry_run:
            stats["inserted"] += 1
            continue

        new_id = str(uuid.uuid4())
        cur.execute(
            """
            INSERT INTO users (
              id, organization_id, email, display_name, avatar_url,
              password_hash, role, is_active, email_verified,
              oauth_provider, oauth_id, timezone, language,
              notification_preferences
            ) VALUES (
              %s::uuid, %s::uuid, %s, %s, %s,
              NULL, %s, false, false,
              'jira', %s, NULL, 'en',
              '{"email":true,"inApp":true}'::jsonb
            )
            """,
            (
                new_id,
                org_id,
                m.email,
                m.display_name,
                m.avatar_url,
                role,
                m.account_id,
            ),
        )
        stats["inserted"] += 1

    return stats


def load_site_admin_ids(group_name: str) -> set[str]:
    try:
        raw = fetch_group_members_paginated(group_name)
    except Exception as e:
        print(f"  Warning: could not load site-admins group {group_name!r}: {e}", file=sys.stderr)
        return set()
    return {str(x["accountId"]) for x in raw if isinstance(x, dict) and x.get("accountId")}


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync Jira Cloud group members into Boardupscale users table.")
    ap.add_argument(
        "--org-id",
        default=os.environ.get("BOARDUPSCALE_ORG_ID"),
        help="Boardupscale organization UUID (or env BOARDUPSCALE_ORG_ID)",
    )
    ap.add_argument(
        "--members-group",
        default=os.environ.get("JIRA_MEMBERS_GROUP_NAME", "jira-software-users-codeupscale"),
        help="Jira group name whose members to import (default: jira-software-users-codeupscale)",
    )
    ap.add_argument(
        "--site-admins-group",
        default=os.environ.get("JIRA_SITE_ADMINS_GROUP_NAME", "site-admins"),
        help="Jira group name for site admins → role admin in Boardupscale",
    )
    ap.add_argument(
        "--include-apps",
        action="store_true",
        help="Include non-atlassian accounts (integrations). Default: humans only (accountType=atlassian).",
    )
    ap.add_argument("--dry-run", action="store_true", help="No database writes")
    args = ap.parse_args()

    if not args.org_id:
        raise SystemExit("--org-id or BOARDUPSCALE_ORG_ID is required")
    org_id = args.org_id.strip()

    if "JIRA_URL" not in os.environ:
        raise SystemExit("JIRA_URL must be set")

    print(f"Fetching Jira group: {args.members_group!r} …", flush=True)
    raw_members = fetch_group_members_paginated(args.members_group)
    print(f"  Raw group rows: {len(raw_members)}", flush=True)

    print(f"Fetching Jira site-admins group: {args.site_admins_group!r} …", flush=True)
    site_admin_ids = load_site_admin_ids(args.site_admins_group)
    print(f"  Site admin accountIds: {len(site_admin_ids)}", flush=True)

    print("Enriching users (extra Jira calls only if email missing from group) …", flush=True)
    members = build_member_rows(raw_members, site_admin_ids, include_apps=args.include_apps)
    print(f"  Importable members (with email): {len(members)}", flush=True)

    conn = connect_db()
    try:
        conn.autocommit = False
        with conn.cursor() as cur:
            org_name = ensure_org(cur, org_id)
            print(f"Target organization: {org_name} ({org_id})", flush=True)
            if args.dry_run:
                print("DRY RUN — no INSERT/UPDATE will be committed.", flush=True)
            stats = sync_members(cur, org_id, members, dry_run=args.dry_run)
            if args.dry_run:
                conn.rollback()
            else:
                conn.commit()
    finally:
        conn.close()

    print("Done.", flush=True)
    print(json.dumps(stats, indent=2), flush=True)


if __name__ == "__main__":
    main()
