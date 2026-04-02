#!/usr/bin/env python3
"""
jira_cloud_import.py — Trigger a live Jira → Boardupscale API import.

This script authenticates against the Boardupscale API, saves (or reuses) a
Jira connection, and enqueues a jira-api-import BullMQ job for the specified
Jira project keys.  The BullMQ worker (services/worker) must be running to
process the job.

Required environment variables
-------------------------------
BOARDUPSCALE_URL      Base URL of the running API, e.g. http://localhost:4000
BOARDUPSCALE_EMAIL    Email address of a Boardupscale user in the target org
BOARDUPSCALE_PASSWORD Password of that user
JIRA_URL              Jira Cloud base URL, e.g. https://acme.atlassian.net
JIRA_USERNAME         Jira account email (used for Basic Auth)
JIRA_API_TOKEN        Jira API token from id.atlassian.com/manage-profile/security/api-tokens

Optional environment variables
--------------------------------
JIRA_PROJECT_KEYS     Comma-separated project keys to import (default: all visible projects)
BOARDUPSCALE_ORG_ID   Organisation UUID (auto-detected from login response if omitted)
SKIP_EXISTING         Set to '1' to skip already-imported issues (always true for API imports)
MAX_PROJECTS          Maximum number of Jira projects to import in one run (default: unlimited)
DRY_RUN               Set to '1' to show what would be imported without triggering the job

Usage
-----
# Import all visible Jira projects
python3 scripts/jira_cloud_import.py

# Import specific projects
JIRA_PROJECT_KEYS=DROM,ILG python3 scripts/jira_cloud_import.py

# Dry run — print plan but do not enqueue
DRY_RUN=1 python3 scripts/jira_cloud_import.py --max-projects 3

# Pass flags directly
python3 scripts/jira_cloud_import.py --project-keys DROM ILG --max-projects 2
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
import urllib.error
from typing import Any


# ─── HTTP helpers ─────────────────────────────────────────────────────────────

def api_request(
    method: str,
    url: str,
    body: Any = None,
    headers: dict | None = None,
    bearer_token: str | None = None,
) -> Any:
    """Make a JSON HTTP request and return the parsed response body."""
    req_headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    if bearer_token:
        req_headers["Authorization"] = f"Bearer {bearer_token}"

    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except Exception:
            detail = raw
        print(f"[ERROR] HTTP {exc.code} {method} {url}: {detail}", file=sys.stderr)
        sys.exit(1)


# ─── Boardupscale auth ────────────────────────────────────────────────────────

def login(base_url: str, email: str, password: str) -> tuple[str, str]:
    """Log in and return (access_token, organization_id)."""
    resp = api_request("POST", f"{base_url}/api/auth/login", {"email": email, "password": password})
    token = resp.get("data", {}).get("accessToken") or resp.get("accessToken")
    org_id = (
        resp.get("data", {}).get("user", {}).get("organizationId")
        or resp.get("data", {}).get("organizationId")
        or resp.get("organizationId")
    )
    if not token:
        print(f"[ERROR] Login did not return an access token. Response: {resp}", file=sys.stderr)
        sys.exit(1)
    if not org_id:
        print(f"[WARN] Could not detect organizationId from login response — set BOARDUPSCALE_ORG_ID manually")
        org_id = os.environ.get("BOARDUPSCALE_ORG_ID", "")
    if not org_id:
        print("[ERROR] organizationId is required. Set BOARDUPSCALE_ORG_ID in the environment.", file=sys.stderr)
        sys.exit(1)
    return token, org_id


# ─── Jira connection management ───────────────────────────────────────────────

def get_or_create_connection(base_url: str, token: str, jira_url: str, jira_email: str, jira_api_token: str) -> str:
    """Return the ID of the active Jira connection, creating it if necessary."""
    existing = api_request("GET", f"{base_url}/api/import/jira/connection", bearer_token=token)
    conn = existing.get("data")
    if conn and conn.get("id") and conn.get("isActive"):
        print(f"[INFO] Reusing existing Jira connection {conn['id']} ({conn['jiraUrl']})")
        return conn["id"]

    print(f"[INFO] Saving new Jira connection for {jira_url}...")
    saved = api_request(
        "POST",
        f"{base_url}/api/import/jira/connection",
        {"jiraUrl": jira_url, "jiraEmail": jira_email, "apiToken": jira_api_token},
        bearer_token=token,
    )
    conn_id = saved.get("data", {}).get("id")
    if not conn_id:
        print(f"[ERROR] Failed to save Jira connection: {saved}", file=sys.stderr)
        sys.exit(1)
    print(f"[INFO] Jira connection saved: {conn_id}")
    return conn_id


def test_connection(base_url: str, token: str, conn_id: str) -> None:
    """Test the saved Jira connection and abort if it fails."""
    result = api_request("POST", f"{base_url}/api/import/jira/connection/{conn_id}/test", bearer_token=token)
    ok = result.get("data", {}).get("ok", False)
    display_name = result.get("data", {}).get("displayName", "?")
    if not ok:
        err = result.get("data", {}).get("errorMessage", "unknown error")
        print(f"[ERROR] Jira connection test failed: {err}", file=sys.stderr)
        sys.exit(1)
    print(f"[INFO] Jira connection verified. Authenticated as: {display_name}")


def list_jira_projects(base_url: str, token: str, conn_id: str) -> list[dict]:
    """List Jira projects available via the saved connection."""
    resp = api_request("GET", f"{base_url}/api/import/jira/connection/{conn_id}/projects", bearer_token=token)
    return resp.get("data", [])


# ─── Import job trigger ───────────────────────────────────────────────────────

def start_api_import(
    base_url: str,
    token: str,
    conn_id: str,
    project_keys: list[str],
    target_project_id: str | None = None,
) -> str:
    """Enqueue a jira-api-import job and return the job ID."""
    payload: dict = {"connectionId": conn_id, "projectKeys": project_keys}
    if target_project_id:
        payload["targetProjectId"] = target_project_id

    resp = api_request("POST", f"{base_url}/api/import/jira/connect/start", payload, bearer_token=token)
    job_id = resp.get("data", {}).get("jobId")
    if not job_id:
        print(f"[ERROR] Start import did not return a jobId: {resp}", file=sys.stderr)
        sys.exit(1)
    return job_id


def poll_job_status(base_url: str, token: str, job_id: str) -> dict:
    """Return the current job status from the API."""
    resp = api_request("GET", f"{base_url}/api/import/jira/status/{job_id}", bearer_token=token)
    return resp.get("data", {})


# ─── Main ─────────────────────────────────────────────────────────────────────

def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Trigger a Jira → Boardupscale live API import.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage")[1] if "Usage" in __doc__ else "",
    )
    p.add_argument(
        "--project-keys",
        nargs="+",
        metavar="KEY",
        help="Jira project keys to import. Overrides JIRA_PROJECT_KEYS env var.",
    )
    p.add_argument(
        "--max-projects",
        type=int,
        default=None,
        help="Maximum number of projects to import (for testing with large Jira instances).",
    )
    p.add_argument(
        "--target-project-id",
        default=None,
        help="Import all selected Jira projects into a single existing Boardupscale project.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=os.environ.get("DRY_RUN", "").strip() in ("1", "true", "yes"),
        help="Print what would be imported without enqueuing a job.",
    )
    p.add_argument(
        "--no-poll",
        action="store_true",
        help="Exit immediately after enqueuing the job (do not wait for status).",
    )
    return p


def main() -> None:
    parser = build_arg_parser()
    args = parser.parse_args()

    # ── Resolve required env vars ──────────────────────────────────────────────
    base_url = os.environ.get("BOARDUPSCALE_URL", "http://localhost:4000").rstrip("/")
    email = os.environ.get("BOARDUPSCALE_EMAIL", "")
    password = os.environ.get("BOARDUPSCALE_PASSWORD", "")
    jira_url = os.environ.get("JIRA_URL", "").rstrip("/")
    jira_username = os.environ.get("JIRA_USERNAME", "")
    jira_api_token = os.environ.get("JIRA_API_TOKEN", "")

    missing = [k for k, v in [
        ("BOARDUPSCALE_EMAIL", email),
        ("BOARDUPSCALE_PASSWORD", password),
        ("JIRA_URL", jira_url),
        ("JIRA_USERNAME", jira_username),
        ("JIRA_API_TOKEN", jira_api_token),
    ] if not v]

    if missing:
        print(f"[ERROR] Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        print("        See the module docstring for the full list of required vars.", file=sys.stderr)
        sys.exit(1)

    # ── Resolve project keys ───────────────────────────────────────────────────
    env_keys_raw = os.environ.get("JIRA_PROJECT_KEYS", "")
    env_keys = [k.strip() for k in env_keys_raw.split(",") if k.strip()] if env_keys_raw else []
    project_keys = args.project_keys or env_keys  # explicit arg wins over env

    # ── Auth ───────────────────────────────────────────────────────────────────
    print(f"[INFO] Authenticating against {base_url}...")
    token, org_id = login(base_url, email, password)
    print(f"[INFO] Authenticated. Organisation: {org_id}")

    # ── Jira connection ────────────────────────────────────────────────────────
    conn_id = get_or_create_connection(base_url, token, jira_url, jira_username, jira_api_token)
    test_connection(base_url, token, conn_id)

    # ── Discover project keys if not specified ─────────────────────────────────
    if not project_keys:
        print("[INFO] No project keys specified — fetching all visible Jira projects...")
        jira_projects = list_jira_projects(base_url, token, conn_id)
        project_keys = [p["key"] for p in jira_projects]
        print(f"[INFO] Found {len(project_keys)} projects: {', '.join(project_keys)}")

    if not project_keys:
        print("[WARN] No Jira projects found or accessible. Nothing to import.", file=sys.stderr)
        sys.exit(0)

    # Apply max-projects cap
    max_projects = args.max_projects or (
        int(os.environ.get("MAX_PROJECTS", "0")) or None
    )
    if max_projects and len(project_keys) > max_projects:
        print(f"[INFO] Capping to {max_projects} projects (--max-projects)")
        project_keys = project_keys[:max_projects]

    # ── Dry run ────────────────────────────────────────────────────────────────
    print()
    print("Import plan:")
    print(f"  Jira URL:        {jira_url}")
    print(f"  Jira projects:   {', '.join(project_keys)}")
    print(f"  Connection ID:   {conn_id}")
    print(f"  Organisation:    {org_id}")
    if args.target_project_id:
        print(f"  Target project:  {args.target_project_id}")
    print()

    if args.dry_run:
        print("[DRY RUN] --dry-run is set. No import job was enqueued.")
        sys.exit(0)

    # ── Enqueue the import job ─────────────────────────────────────────────────
    print(f"[INFO] Enqueuing jira-api-import for {len(project_keys)} project(s)...")
    job_id = start_api_import(base_url, token, conn_id, project_keys, args.target_project_id)
    print(f"[INFO] Import job enqueued. Job ID: {job_id}")
    print(f"[INFO] Poll status: GET {base_url}/api/import/jira/status/{job_id}")
    print()

    if args.no_poll:
        print("[INFO] --no-poll set. Exiting. Monitor the job via the API or worker logs.")
        sys.exit(0)

    # ── Print initial status and exit (worker runs async) ─────────────────────
    status = poll_job_status(base_url, token, job_id)
    print(f"[INFO] Initial job status: {status.get('status', 'unknown')}")
    print()
    print("The import is running asynchronously in the BullMQ worker.")
    print(f"Check progress: GET {base_url}/api/import/jira/status/{job_id}")
    print("Or watch the worker logs: cd services/worker && npm run dev")


if __name__ == "__main__":
    main()
