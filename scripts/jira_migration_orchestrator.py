#!/usr/bin/env python3
"""
Production-oriented entrypoint for Jira → Boardupscale migration.

This does NOT replace the API/worker (issues are imported via BullMQ). It chains:

  1. Optional: org users from Jira groups → Postgres (`jira_sync_org_members_to_db.py`)
  2. Issues: Jira REST → JSON → upload → `import` queue (`jira_cloud_import.py`)

Read: docs/JIRA_TO_BOARDUPSCALE_MIGRATION_PLAN.md

Examples:
  # Sanity-check env
  python3 scripts/jira_migration_orchestrator.py doctor

  # Sync members only (needs DATABASE_URL, BOARDUPSCALE_ORG_ID, JIRA_*)
  python3 scripts/jira_migration_orchestrator.py sync-members -- --dry-run

  # Import issues (needs BOARDUPSCALE_EMAIL/PASSWORD, JIRA_*, worker running)
  python3 scripts/jira_migration_orchestrator.py import-issues -- --skip-existing --max-projects 3

  # Both phases
  python3 scripts/jira_migration_orchestrator.py full -- --skip-existing
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent


def run_py(script: str, extra: list[str]) -> int:
    cmd = [sys.executable, str(SCRIPTS / script), *extra]
    print("$", " ".join(cmd), flush=True)
    return subprocess.call(cmd, cwd=str(ROOT))


def cmd_doctor() -> int:
    ok = True
    for label, keys in [
        ("Jira", ("JIRA_URL", "JIRA_USERNAME", "JIRA_API_TOKEN")),
        ("Boardupscale API (for issues)", ("BOARDUPSCALE_EMAIL", "BOARDUPSCALE_PASSWORD")),
        ("Boardupscale DB (for member sync)", ("DATABASE_URL", "BOARDUPSCALE_ORG_ID")),
    ]:
        missing = [k for k in keys if not os.environ.get(k)]
        if missing:
            print(f"[MISS] {label}: {', '.join(missing)}")
            ok = False
        else:
            print(f"[ OK ] {label}")
    print()
    print("Worker: import queue must be consumed (services/worker) for issue import.")
    print("Docs:   docs/JIRA_TO_BOARDUPSCALE_MIGRATION_PLAN.md")
    return 0 if ok else 1


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Orchestrate Jira → Boardupscale migration phases (see docs).",
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="Print required env vars and reminders")

    p_sync = sub.add_parser("sync-members", help="Run jira_sync_org_members_to_db.py")
    p_sync.add_argument(
        "passthrough",
        nargs=argparse.REMAINDER,
        help="Args after -- go to the member script (e.g. -- --dry-run)",
    )

    p_imp = sub.add_parser("import-issues", help="Run jira_cloud_import.py")
    p_imp.add_argument(
        "passthrough",
        nargs=argparse.REMAINDER,
        help="Args after -- go to jira_cloud_import.py (e.g. -- --all-projects)",
    )

    p_full = sub.add_parser("full", help="sync-members then import-issues (pass -- twice if needed)")
    p_full.add_argument(
        "passthrough",
        nargs=argparse.REMAINDER,
        help="All args after 'full' are passed to BOTH scripts; prefer running phases separately for control.",
    )

    args = ap.parse_args()

    if args.cmd == "doctor":
        raise SystemExit(cmd_doctor())

    if args.cmd == "sync-members":
        extra = list(args.passthrough)
        if extra and extra[0] == "--":
            extra = extra[1:]
        raise SystemExit(run_py("jira_sync_org_members_to_db.py", extra))

    if args.cmd == "import-issues":
        extra = list(args.passthrough)
        if extra and extra[0] == "--":
            extra = extra[1:]
        raise SystemExit(run_py("jira_cloud_import.py", extra))

    if args.cmd == "full":
        extra = list(args.passthrough)
        if extra and extra[0] == "--":
            extra = extra[1:]
        print("=== Phase A: members ===", flush=True)
        a = run_py("jira_sync_org_members_to_db.py", extra)
        if a != 0:
            raise SystemExit(a)
        print("\n=== Phase B: issues ===", flush=True)
        raise SystemExit(run_py("jira_cloud_import.py", extra))


if __name__ == "__main__":
    main()
