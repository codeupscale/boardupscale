#!/usr/bin/env python3
"""
org-stats — boardupscale Organization Stats Fetcher
-----------------------------------------------------
Fetches full org stats from the database by owner email.
Zero AI tokens — direct DB read.

Usage:
  python3 scripts/org-stats.py
  python3 scripts/org-stats.py --email admin@example.com
  python3 scripts/org-stats.py --email admin@example.com --export

Config (in order of priority):
  1. DATABASE_URL env variable
  2. services/api/.env  DB_* variables
  3. Default: localhost:5435 (docker-compose dev)
"""

import argparse
import os
import sys
import re
import json
from datetime import datetime, timezone
from pathlib import Path

# ── ANSI colours ──────────────────────────────────────────────────────────
R   = "\033[0m"
B   = "\033[1m"
RED = "\033[91m"
GRN = "\033[92m"
YLW = "\033[93m"
BLU = "\033[94m"
CYN = "\033[96m"
DIM = "\033[2m"
MGT = "\033[95m"

def c(col, t):    return f"{col}{t}{R}"
def box(title):
    w = 56
    print(f"\n{B}{BLU}╔{'═'*w}╗{R}")
    pad = (w - len(title)) // 2
    print(f"{B}{BLU}║{' '*pad}{CYN}{title}{BLU}{' '*(w-pad-len(title))}║{R}")
    print(f"{B}{BLU}╚{'═'*w}╝{R}")

def section(title):
    print(f"\n  {B}{MGT}▌ {title}{R}")
    print(f"  {DIM}{'─'*52}{R}")

def row(label, value, note=""):
    label_str = f"{DIM}{label:<28}{R}"
    value_str = f"{B}{value}{R}"
    note_str  = f"  {DIM}{note}{R}" if note else ""
    print(f"    {label_str}  {value_str}{note_str}")

def ok(t):   print(f"  {GRN}✅ {t}{R}")
def err(t):  print(f"  {RED}✗  {t}{R}", file=sys.stderr)
def info(t): print(f"  {CYN}→  {t}{R}")
def warn(t): print(f"  {YLW}⚠  {t}{R}")

# ── DB connection ─────────────────────────────────────────────────────────
def resolve_db_url():
    """Find DB URL from env → .env file → docker-compose default."""
    # 1. Direct env var
    url = os.environ.get("DATABASE_URL", "")
    if url:
        return url

    # 2. Parse .env (project root first, then services/api/.env)
    root = Path(__file__).parent.parent
    for candidate in [root / ".env", root / "services" / "api" / ".env"]:
        env_path = candidate
        if env_path.exists():
            break
    else:
        env_path = None

    if env_path and env_path.exists():
        env_vars = {}
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip().strip('"').strip("'")
        if "DATABASE_URL" in env_vars:
            return env_vars["DATABASE_URL"]
        # Build from parts
        host = env_vars.get("DB_HOST", "localhost")
        port = env_vars.get("DB_PORT", "5435")
        user = env_vars.get("DB_USER", "boardupscale")
        pw   = env_vars.get("DB_PASSWORD", "boardupscale")
        name = env_vars.get("DB_NAME", "boardupscale")
        return f"postgresql://{user}:{pw}@{host}:{port}/{name}"

    # 3. Docker-compose dev default
    return "postgresql://boardupscale:boardupscale@localhost:5435/boardupscale"

def parse_db_url(url):
    """Parse postgresql://user:pass@host:port/db → dict."""
    m = re.match(
        r"postgresql(?:\+\w+)?://([^:]+):([^@]*)@([^:/]+):?(\d+)?/(.+)",
        url
    )
    if not m:
        raise ValueError(f"Cannot parse DATABASE_URL: {url}")
    return {
        "user":     m.group(1),
        "password": m.group(2),
        "host":     m.group(3),
        "port":     int(m.group(4) or 5432),
        "dbname":   m.group(5).split("?")[0],
    }

def connect(db_url):
    try:
        import psycopg2
        params = parse_db_url(db_url)
        conn = psycopg2.connect(**params)
        conn.autocommit = True
        return conn
    except ImportError:
        err("psycopg2 not installed. Run: pip3 install psycopg2-binary")
        sys.exit(1)
    except Exception as e:
        err(f"Cannot connect to database: {e}")
        err(f"URL: {db_url}")
        err("Is docker-compose running?  →  docker compose up -d postgres")
        sys.exit(1)

def q(cur, sql, params=()):
    cur.execute(sql, params)
    return cur.fetchall()

def q1(cur, sql, params=()):
    cur.execute(sql, params)
    row_ = cur.fetchone()
    return row_[0] if row_ else None

# ── Fetch helpers ─────────────────────────────────────────────────────────
def fetch_org_by_email(cur, email):
    rows = q(cur, """
        SELECT
            o.id,
            o.name,
            o.slug,
            o.settings,
            o.created_at,
            u.id        AS owner_id,
            u.display_name AS owner_name,
            u.email     AS owner_email,
            u.role      AS owner_role,
            u.last_login_at,
            u.is_active AS owner_active
        FROM users u
        JOIN organizations o ON o.id = u.organization_id
        WHERE LOWER(u.email) = LOWER(%s)
          AND u.role IN ('admin', 'owner')
        ORDER BY u.role DESC
        LIMIT 1
    """, (email,))
    return rows[0] if rows else None

def fetch_subscription(cur, org_id):
    rows = q(cur, """
        SELECT
            s.id,
            s.status,
            s.current_period_start,
            s.current_period_end,
            s.cancel_at_period_end,
            s.stripe_customer_id,
            s.stripe_subscription_id,
            s.created_at            AS subscribed_at,
            bp.name                 AS plan_name,
            bp.slug                 AS plan_slug,
            bp.price_monthly,
            bp.price_yearly,
            bp.max_users,
            bp.max_storage_gb,
            bp.features
        FROM subscriptions s
        JOIN billing_plans bp ON bp.id = s.plan_id
        WHERE s.organization_id = %s
    """, (org_id,))
    return rows[0] if rows else None

def fetch_member_stats(cur, org_id):
    rows = q(cur, """
        SELECT
            COUNT(*)                                       AS total,
            COUNT(*) FILTER (WHERE is_active = true)      AS active,
            COUNT(*) FILTER (WHERE is_active = false)     AS inactive,
            COUNT(*) FILTER (WHERE role = 'admin')        AS admins,
            COUNT(*) FILTER (WHERE role = 'member')       AS members,
            COUNT(*) FILTER (WHERE role = 'viewer')       AS viewers,
            MIN(created_at)                               AS first_member,
            MAX(created_at)                               AS last_joined
        FROM users
        WHERE organization_id = %s
    """, (org_id,))
    return rows[0] if rows else None

def fetch_recent_members(cur, org_id, limit=5):
    return q(cur, """
        SELECT display_name, email, role, created_at
        FROM users
        WHERE organization_id = %s
        ORDER BY created_at DESC
        LIMIT %s
    """, (org_id, limit))

def fetch_project_stats(cur, org_id):
    rows = q(cur, """
        SELECT
            COUNT(*)                                          AS total,
            COUNT(*) FILTER (WHERE status = 'active')        AS active,
            COUNT(*) FILTER (WHERE status = 'archived')      AS archived,
            COUNT(*) FILTER (WHERE type = 'scrum')           AS scrum,
            COUNT(*) FILTER (WHERE type = 'kanban')          AS kanban,
            MIN(created_at)                                   AS first_created,
            MAX(created_at)                                   AS last_created
        FROM projects
        WHERE organization_id = %s
    """, (org_id,))
    return rows[0] if rows else None

def fetch_projects_list(cur, org_id, limit=5):
    return q(cur, """
        SELECT name, key, type, status, created_at
        FROM projects
        WHERE organization_id = %s
        ORDER BY created_at DESC
        LIMIT %s
    """, (org_id, limit))

def fetch_issue_stats(cur, org_id):
    rows = q(cur, """
        SELECT
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE type = 'bug')                  AS bugs,
            COUNT(*) FILTER (WHERE type = 'task')                 AS tasks,
            COUNT(*) FILTER (WHERE type = 'story')                AS stories,
            COUNT(*) FILTER (WHERE type = 'epic')                 AS epics,
            COUNT(*) FILTER (WHERE priority = 'critical')         AS critical,
            COUNT(*) FILTER (WHERE priority = 'high')             AS high,
            COUNT(DISTINCT assignee_id)
                FILTER (WHERE assignee_id IS NOT NULL)            AS assignees,
            ROUND(AVG(story_points) FILTER (
                WHERE story_points IS NOT NULL), 1)               AS avg_story_pts,
            MIN(created_at)                                        AS first_issue,
            MAX(created_at)                                        AS last_issue
        FROM issues
        WHERE organization_id = %s
    """, (org_id,))
    return rows[0] if rows else None

def fetch_issue_status_breakdown(cur, org_id):
    return q(cur, """
        SELECT
            ist.name    AS status_name,
            ist.category,
            COUNT(i.id) AS count
        FROM issues i
        JOIN issue_statuses ist ON ist.id = i.status_id
        WHERE i.organization_id = %s
        GROUP BY ist.name, ist.category
        ORDER BY count DESC
        LIMIT 8
    """, (org_id,))

def fetch_sprint_stats(cur, org_id):
    rows = q(cur, """
        SELECT
            COUNT(*)                                              AS total,
            COUNT(*) FILTER (WHERE s.status = 'active')          AS active,
            COUNT(*) FILTER (WHERE s.status = 'completed')       AS completed,
            COUNT(*) FILTER (WHERE s.status = 'planned')         AS planned,
            MIN(s.created_at)                                     AS first_sprint,
            MAX(s.created_at)                                     AS last_sprint,
            AVG(EXTRACT(EPOCH FROM (s.end_date::timestamptz
                - s.start_date::timestamptz)) / 86400)
                FILTER (WHERE s.start_date IS NOT NULL
                          AND s.end_date IS NOT NULL)             AS avg_duration_days
        FROM sprints s
        JOIN projects p ON p.id = s.project_id
        WHERE p.organization_id = %s
    """, (org_id,))
    return rows[0] if rows else None

def fetch_activity_timeline(cur, org_id):
    """Month-by-month issue creation for last 6 months."""
    return q(cur, """
        SELECT
            TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS month,
            COUNT(*) AS issues_created
        FROM issues
        WHERE organization_id = %s
          AND created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY DATE_TRUNC('month', created_at)
    """, (org_id,))

# ── Formatters ────────────────────────────────────────────────────────────
def fmt_date(dt):
    if not dt:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%d %b %Y")
    return str(dt)

def fmt_datetime(dt):
    if not dt:
        return "—"
    if hasattr(dt, "strftime"):
        return dt.strftime("%d %b %Y %H:%M")
    return str(dt)

def fmt_money(cents):
    if not cents:
        return "Free"
    return f"${cents/100:.2f}/mo" if cents < 10000 else f"${cents:.0f}/mo"

def age_since(dt):
    if not dt:
        return "—"
    now = datetime.now(timezone.utc)
    if not hasattr(dt, "tzinfo"):
        from datetime import timezone as tz
        dt = dt.replace(tzinfo=tz.utc)
    delta = now - dt
    days = delta.days
    if days < 30:
        return f"{days}d ago"
    if days < 365:
        return f"{days//30}mo ago"
    return f"{days//365}y {(days%365)//30}mo ago"

def bar_chart(value, max_val, width=20):
    if not max_val or max_val == 0:
        return "░" * width
    filled = int((value / max_val) * width)
    return f"{GRN}{'█' * filled}{DIM}{'░' * (width - filled)}{R}"

# ── Report printer ────────────────────────────────────────────────────────
def print_report(data):
    box("boardupscale  ·  Org Stats Report")

    # ── Organization ──────────────────────────────────────────────────────
    section("🏢  Organization")
    o = data["org"]
    row("Name",         o[1])
    row("Slug",         o[2])
    row("Created",      fmt_date(o[4]),        age_since(o[4]))
    row("Owner",        o[6],                  f"<{o[7]}>")
    row("Owner role",   o[8].upper())
    row("Last login",   fmt_datetime(o[9]),    "owner")
    row("Owner active", "Yes" if o[10] else c(RED, "No"))

    # ── Billing ───────────────────────────────────────────────────────────
    section("💳  Billing & Subscription")
    s = data.get("subscription")
    if s:
        status_colour = GRN if s[1] == "active" else RED
        row("Plan",           f"{s[8]} ({s[9]})")
        row("Status",         c(status_colour, s[1].upper()))
        row("Price",          fmt_money(s[10]),   f"monthly  |  {fmt_money(s[11])} yearly")
        row("Max users",      str(s[12]) if s[12] != -1 else "Unlimited")
        row("Storage",        f"{s[13]} GB")
        row("Subscribed",     fmt_date(s[7]),     age_since(s[7]))
        row("Period start",   fmt_date(s[2]))
        row("Period end",     fmt_date(s[3]))
        row("Auto-renew",     c(RED, "OFF — cancels at period end") if s[4] else "Yes")
        if s[5]:
            row("Stripe customer",  s[5])
        if s[6]:
            row("Stripe sub ID",    s[6])
        # Features
        if s[14]:
            feats = [k for k, v in s[14].items() if v]
            if feats:
                row("Features", ", ".join(feats))
    else:
        warn("No subscription found (free plan or not set up)")

    # ── Members ───────────────────────────────────────────────────────────
    section("👥  Team & Members")
    m = data["members"]
    if m:
        row("Total members",  str(m[0]))
        row("Active",         c(GRN, str(m[1])))
        row("Inactive",       c(RED, str(m[2])) if m[2] else str(m[2]))
        row("Admins",         str(m[3]))
        row("Members",        str(m[4]))
        row("Viewers",        str(m[5]))
        row("First member",   fmt_date(m[6]),    age_since(m[6]))
        row("Last joined",    fmt_date(m[7]),    age_since(m[7]))
        if data.get("recent_members"):
            print(f"\n    {DIM}{'Recent members':28}  {'Role':<12} {'Joined'}{R}")
            for rm in data["recent_members"]:
                print(f"    {DIM}{rm[0]:<28}{R}  {rm[2]:<12} {fmt_date(rm[3])}")

    # ── Projects ──────────────────────────────────────────────────────────
    section("📁  Projects")
    p = data["projects"]
    if p:
        row("Total",          str(p[0]))
        row("Active",         c(GRN, str(p[1])))
        row("Archived",       str(p[2]))
        row("Scrum",          str(p[3]))
        row("Kanban",         str(p[4]))
        row("First project",  fmt_date(p[5]),    age_since(p[5]))
        row("Latest project", fmt_date(p[6]),    age_since(p[6]))
        if data.get("projects_list"):
            print(f"\n    {DIM}{'Project':<22}  {'Key':<8} {'Type':<10} {'Status'}{R}")
            for pl in data["projects_list"]:
                print(f"    {pl[0]:<22}  {DIM}{pl[1]:<8} {pl[2]:<10} {pl[3]}{R}")

    # ── Issues ────────────────────────────────────────────────────────────
    section("🐛  Issues")
    i = data["issues"]
    if i:
        row("Total issues",   str(i[0]))
        row("Bugs",           str(i[1]))
        row("Tasks",          str(i[2]))
        row("Stories",        str(i[3]))
        row("Epics",          str(i[4]))
        row("Critical",       c(RED, str(i[5])))
        row("High priority",  c(YLW, str(i[6])))
        row("Active assignees", str(i[7]))
        row("Avg story pts",  str(i[8]) if i[8] else "—")
        row("First issue",    fmt_date(i[9]),    age_since(i[9]))
        row("Latest issue",   fmt_date(i[10]),   age_since(i[10]))
        # Status breakdown
        if data.get("issue_statuses"):
            max_count = max(r[2] for r in data["issue_statuses"]) or 1
            print(f"\n    {DIM}{'Status':<20}  {'Category':<12} Count{R}")
            for st in data["issue_statuses"]:
                bar = bar_chart(st[2], max_count, 12)
                print(f"    {st[0]:<20}  {DIM}{st[1]:<12}{R} {st[2]:>5}  {bar}")

    # ── Sprints ───────────────────────────────────────────────────────────
    section("🏃  Sprints")
    sp = data["sprints"]
    if sp:
        row("Total sprints",  str(sp[0]))
        row("Active",         c(GRN, str(sp[1])))
        row("Completed",      str(sp[2]))
        row("Planned",        str(sp[3]))
        row("First sprint",   fmt_date(sp[4]),   age_since(sp[4]))
        row("Latest sprint",  fmt_date(sp[5]),   age_since(sp[5]))
        avg_days = round(float(sp[6]), 1) if sp[6] else None
        row("Avg duration",   f"{avg_days} days" if avg_days else "—")

    # ── Activity Timeline ─────────────────────────────────────────────────
    if data.get("timeline"):
        section("📈  Issue Activity (last 6 months)")
        max_val = max(r[1] for r in data["timeline"]) or 1
        for t in data["timeline"]:
            bar = bar_chart(t[1], max_val, 25)
            print(f"    {t[0]:<12}  {bar}  {t[1]:>4}")

    # ── Summary ───────────────────────────────────────────────────────────
    box("Summary")
    age_days = (datetime.now(timezone.utc) - o[4].replace(
        tzinfo=timezone.utc if not o[4].tzinfo else o[4].tzinfo
    )).days if o[4] else 0

    print(f"""
  {DIM}Organization age:  {R}{B}{age_days} days  ({age_since(o[4])}){R}
  {DIM}Members:           {R}{B}{m[0] if m else '—'}{R}
  {DIM}Projects:          {R}{B}{p[0] if p else '—'}{R}
  {DIM}Total issues:      {R}{B}{i[0] if i else '—'}{R}
  {DIM}Total sprints:     {R}{B}{sp[0] if sp else '—'}{R}
  {DIM}Plan:              {R}{B}{s[8] if s else 'Free'}{R}
  {DIM}Subscription:      {R}{B}{s[1].upper() if s else '—'}{R}

  {DIM}Report generated:  {R}{fmt_datetime(datetime.now())}
    """)


# ── Export ────────────────────────────────────────────────────────────────
def export_json(data, email):
    def serialise(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, tuple):
            return list(obj)
        return str(obj)

    filename = f"org-stats-{email.replace('@','_').replace('.','_')}-{datetime.now().strftime('%Y%m%d-%H%M')}.json"
    path = Path(__file__).parent / filename
    with open(path, "w") as f:
        json.dump({k: v for k, v in data.items()}, f, default=serialise, indent=2)
    ok(f"Exported to: {path}")


# ── Main ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="boardupscale org stats fetcher")
    parser.add_argument("--email",  help="Org owner email")
    parser.add_argument("--export", action="store_true", help="Export to JSON")
    parser.add_argument("--db",     help="Override DATABASE_URL")
    args = parser.parse_args()

    print(f"\n{B}{BLU}boardupscale · Org Stats{R}  {DIM}(direct DB — zero AI tokens){R}")
    print(f"  {DIM}{'─'*52}{R}")

    # ── DB connection ──────────────────────────────────────────────────────
    db_url = args.db or resolve_db_url()
    parsed = parse_db_url(db_url)
    info(f"Connecting to {parsed['host']}:{parsed['port']}/{parsed['dbname']}...")
    conn = connect(db_url)
    cur = conn.cursor()
    ok("Connected")

    # ── Email prompt ───────────────────────────────────────────────────────
    email = args.email
    if not email:
        print()
        email = input(f"  {YLW}?{R} Enter org owner email: ").strip()
        if not email:
            err("Email is required.")
            sys.exit(1)

    # ── Lookup org ────────────────────────────────────────────────────────
    print()
    info(f"Looking up: {email}")
    org = fetch_org_by_email(cur, email)
    if not org:
        # Try any user with that email (not just admin)
        cur.execute("""
            SELECT o.id, o.name, o.slug, o.settings, o.created_at,
                   u.id, u.display_name, u.email, u.role, u.last_login_at, u.is_active
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            WHERE LOWER(u.email) = LOWER(%s)
            LIMIT 1
        """, (email,))
        org = cur.fetchone()
        if org:
            warn(f"User found but role is '{org[8]}' (not admin) — showing org stats anyway")
        else:
            err(f"No user found with email: {email}")
            err("Check the email or try a different address.")
            sys.exit(1)

    org_id = org[0]
    ok(f"Found org: {B}{org[1]}{R}  (id: {DIM}{org_id}{R})")

    # ── Fetch all stats ───────────────────────────────────────────────────
    info("Fetching stats...")
    data = {
        "org":            org,
        "subscription":   fetch_subscription(cur, org_id),
        "members":        fetch_member_stats(cur, org_id),
        "recent_members": fetch_recent_members(cur, org_id),
        "projects":       fetch_project_stats(cur, org_id),
        "projects_list":  fetch_projects_list(cur, org_id),
        "issues":         fetch_issue_stats(cur, org_id),
        "issue_statuses": fetch_issue_status_breakdown(cur, org_id),
        "sprints":        fetch_sprint_stats(cur, org_id),
        "timeline":       fetch_activity_timeline(cur, org_id),
    }
    ok("All stats fetched")

    # ── Print report ───────────────────────────────────────────────────────
    print_report(data)

    # ── Export ─────────────────────────────────────────────────────────────
    if args.export:
        export_json(data, email)

    cur.close()
    conn.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n  {YLW}Interrupted.{R}")
        sys.exit(0)
