#!/usr/bin/env python3
"""
git-sync — Smart Git workflow script for boardupscale
------------------------------------------------------
Run from anywhere inside the repo:
  python3 scripts/git-sync.py

What it does:
  1. Detects current branch + repo default branch
  2. Asks which branch to sync from (default: main)
  3. Recommends merge vs rebase based on branch type
  4. Fetches + applies cleanly or shows conflicts
  5. Optionally creates a PR via gh CLI
"""

import subprocess
import sys
import os
import re
from pathlib import Path

# ── ANSI colours ──────────────────────────────────────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
CYAN   = "\033[96m"
DIM    = "\033[2m"

def c(color, text):      return f"{color}{text}{RESET}"
def header(text):        print(f"\n{BOLD}{BLUE}{'─'*55}{RESET}\n{BOLD}{BLUE}  {text}{RESET}\n{BOLD}{BLUE}{'─'*55}{RESET}")
def ok(text):            print(f"  {GREEN}✅ {text}{RESET}")
def warn(text):          print(f"  {YELLOW}⚠  {text}{RESET}")
def err(text):           print(f"  {RED}✗  {text}{RESET}", file=sys.stderr)
def info(text):          print(f"  {CYAN}→  {text}{RESET}")
def dim(text):           print(f"  {DIM}{text}{RESET}")

# ── Git helpers ───────────────────────────────────────────────────────────
def run(cmd, capture=True, check=True, cwd=None):
    result = subprocess.run(
        cmd, shell=True, capture_output=capture,
        text=True, check=False, cwd=cwd
    )
    if check and result.returncode != 0:
        raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
    return result

def git(cmd, **kwargs):
    return run(f"git {cmd}", **kwargs)

def git_root():
    r = git("rev-parse --show-toplevel")
    return Path(r.stdout.strip())

def current_branch():
    return git("branch --show-current").stdout.strip()

def default_branch():
    """Detect repo default branch (main / master / develop)."""
    try:
        r = run("git remote show origin 2>/dev/null | grep 'HEAD branch' | awk '{print $3}'")
        branch = r.stdout.strip()
        if branch:
            return branch
    except Exception:
        pass
    for b in ["main", "master", "develop"]:
        r = git(f"branch -r --list origin/{b}", check=False)
        if b in r.stdout:
            return b
    return "main"

def remote_branches():
    r = git("branch -r --format='%(refname:short)'")
    return [b.strip().replace("origin/", "") for b in r.stdout.splitlines() if "->" not in b]

def has_uncommitted():
    r = git("status --porcelain")
    return bool(r.stdout.strip())

def conflict_files():
    r = git("diff --name-only --diff-filter=U", check=False)
    return [f.strip() for f in r.stdout.splitlines() if f.strip()]

def branch_type(branch):
    """Classify branch for merge strategy recommendation."""
    patterns = {
        "feature": ["feat/", "feature/"],
        "fix":     ["fix/", "hotfix/", "bugfix/"],
        "chore":   ["chore/", "refactor/", "docs/"],
        "release": ["release/", "main", "master", "develop", "staging"],
    }
    for kind, prefixes in patterns.items():
        if any(branch.startswith(p) or branch == p.rstrip("/") for p in prefixes):
            return kind
    return "feature"  # default assumption

def recommend_strategy(current, source):
    """Rebase for feature/fix branches, merge for long-lived ones."""
    kind = branch_type(current)
    if kind in ("release",):
        return "merge"
    if kind in ("feature", "fix", "chore"):
        return "rebase"
    return "merge"

def prompt(question, default=None, options=None):
    """Interactive prompt with default value."""
    suffix = ""
    if options:
        suffix = f" [{'/'.join(o.upper() if o == default else o for o in options)}]"
    elif default:
        suffix = f" [{c(BOLD, default)}]"
    answer = input(f"\n  {YELLOW}?{RESET} {question}{suffix}: ").strip()
    if not answer and default is not None:
        return default
    return answer

def prompt_choice(question, choices, default):
    """Pick from a numbered list."""
    print(f"\n  {YELLOW}?{RESET} {question}")
    for i, ch in enumerate(choices, 1):
        marker = f"{GREEN}▶{RESET}" if ch == default else " "
        print(f"    {marker} {i}. {ch}")
    raw = input(f"  Enter number or name [{c(BOLD, default)}]: ").strip()
    if not raw:
        return default
    if raw.isdigit() and 1 <= int(raw) <= len(choices):
        return choices[int(raw) - 1]
    if raw in choices:
        return raw
    warn(f"Invalid choice '{raw}', using default: {default}")
    return default

def branch_name_to_pr_title(branch):
    """Convert fix/add-oauth-login → Add OAuth login."""
    name = re.sub(r"^(feat|fix|chore|hotfix|refactor|docs)/", "", branch)
    name = re.sub(r"[-_]", " ", name)
    return name.strip().capitalize()

# ── Main workflow ─────────────────────────────────────────────────────────
def main():
    header("git-sync — boardupscale")

    # ── Locate repo ───────────────────────────────────────────────────────
    try:
        root = git_root()
        os.chdir(root)
    except subprocess.CalledProcessError:
        err("Not inside a git repository.")
        sys.exit(1)

    info(f"Repo root: {root}")

    # ── Current state ─────────────────────────────────────────────────────
    current = current_branch()
    if not current:
        err("Detached HEAD state — checkout a branch first.")
        sys.exit(1)

    default = default_branch()
    ok(f"Current branch:  {c(BOLD, current)}")
    info(f"Default branch:  {c(BOLD, default)}")

    # ── Uncommitted changes warning ───────────────────────────────────────
    if has_uncommitted():
        warn("You have uncommitted changes.")
        action = prompt_choice(
            "What should we do with them?",
            choices=["stash (restore after sync)", "abort"],
            default="stash (restore after sync)",
        )
        if "abort" in action:
            info("Aborted. Commit or stash your changes first.")
            sys.exit(0)
        print()
        git("stash push -u -m 'git-sync: auto-stash before sync'", capture=False)
        stashed = True
    else:
        stashed = False

    # ── Choose source branch ──────────────────────────────────────────────
    header("Source branch")
    remotes = remote_branches()
    suggested = [default] + [b for b in remotes if b != default and b != current][:6]

    source = prompt_choice(
        "Sync FROM which branch?",
        choices=suggested,
        default=default,
    )

    # ── Fetch ─────────────────────────────────────────────────────────────
    print()
    info(f"Fetching origin/{source}...")
    r = git(f"fetch origin {source}", check=False)
    if r.returncode != 0:
        err(f"Could not fetch origin/{source}:\n{r.stderr}")
        if stashed:
            git("stash pop", capture=False)
        sys.exit(1)
    ok(f"Fetched origin/{source}")

    # ── Check if already up to date ───────────────────────────────────────
    r = git(f"rev-list HEAD..origin/{source} --count")
    ahead_count = int(r.stdout.strip() or "0")
    if ahead_count == 0:
        ok(f"Already up to date with {source}.")
        if stashed:
            print()
            git("stash pop", capture=False)
            ok("Stash restored.")
        _ask_pr(current, source, default)
        return

    info(f"{ahead_count} new commit(s) on origin/{source} to bring in.")

    # ── Strategy ──────────────────────────────────────────────────────────
    header("Merge strategy")
    recommended = recommend_strategy(current, source)
    other = "merge" if recommended == "rebase" else "rebase"

    print(f"  {DIM}Branch type: {branch_type(current)}{RESET}")
    print(f"  {DIM}Recommended: {recommended} (cleaner history for {branch_type(current)} branches){RESET}")

    strategy = prompt_choice(
        "Which strategy?",
        choices=[
            f"{recommended} (recommended)",
            other,
        ],
        default=f"{recommended} (recommended)",
    )
    strategy = "rebase" if "rebase" in strategy else "merge"

    # ── Apply ─────────────────────────────────────────────────────────────
    header(f"Applying {strategy}")
    print()

    if strategy == "rebase":
        r = git(f"rebase origin/{source}", check=False, capture=False)
        success = r.returncode == 0
    else:
        r = git(f"merge origin/{source} --no-edit", check=False, capture=False)
        success = r.returncode == 0

    # ── Conflict handling ─────────────────────────────────────────────────
    if not success:
        conflicts = conflict_files()
        print()
        err(f"{'Rebase' if strategy == 'rebase' else 'Merge'} conflict in {len(conflicts)} file(s):")
        for f in conflicts:
            print(f"    {RED}✗{RESET}  {f}")

        print(f"""
  {YELLOW}Next steps to resolve:{RESET}
  {DIM}1. Open each conflicting file and resolve markers (<<<<<<<, =======, >>>>>>>)
  2. Then run:{RESET}
     {CYAN}git add <resolved-file>{RESET}
  {DIM}3. Then continue:{RESET}
     {CYAN}git {'rebase --continue' if strategy == 'rebase' else 'merge --continue'}{RESET}
  {DIM}Or abort entirely:{RESET}
     {CYAN}git {'rebase --abort' if strategy == 'rebase' else 'merge --abort'}{RESET}
        """)

        if stashed:
            warn("Your stash was NOT restored (conflicts pending). Run 'git stash pop' after resolving.")
        sys.exit(1)

    # ── Success ───────────────────────────────────────────────────────────
    print()
    ok(f"Successfully {strategy}d origin/{source} into {c(BOLD, current)}")

    # Show what came in
    r = git(f"log origin/{source}..HEAD --oneline" if strategy == "rebase"
            else f"log ORIG_HEAD..HEAD --oneline", check=False)
    if r.stdout.strip():
        dim("Commits brought in:")
        for line in r.stdout.strip().splitlines()[:10]:
            dim(f"  {line}")

    # ── Restore stash ─────────────────────────────────────────────────────
    if stashed:
        print()
        info("Restoring stash...")
        r = git("stash pop", check=False, capture=False)
        if r.returncode != 0:
            warn("Stash pop had conflicts — resolve manually with: git stash pop")
        else:
            ok("Stash restored.")

    # ── PR ────────────────────────────────────────────────────────────────
    _ask_pr(current, source, default)


def _ask_pr(current, source, default):
    """Optionally create a PR via gh CLI."""
    if current == default:
        return  # no PR from main to main

    header("Pull Request")

    create = prompt("Create a PR for this branch?", default="n", options=["y", "n"])
    if create.lower() != "y":
        ok("Done. No PR created.")
        return

    # Check gh CLI
    r = run("gh --version", check=False)
    if r.returncode != 0:
        err("gh CLI not installed. Install from: https://cli.github.com")
        return

    # Default title from branch name
    suggested_title = branch_name_to_pr_title(current)
    title = prompt("PR title", default=suggested_title)

    # Base branch (where to merge into)
    base = prompt("Merge INTO which branch?", default=default)

    # Draft?
    draft_ans = prompt("Create as draft?", default="n", options=["y", "n"])
    draft_flag = "--draft" if draft_ans.lower() == "y" else ""

    # Body
    print(f"\n  {YELLOW}?{RESET} PR description (press Enter twice to finish, or leave blank):")
    lines = []
    try:
        while True:
            line = input("    ")
            if not line and lines and not lines[-1]:
                break
            lines.append(line)
    except EOFError:
        pass
    body = "\n".join(lines).strip()
    if not body:
        body = f"## Summary\n- Synced with `{source}` and applied changes from `{current}`\n\n🤖 Created with git-sync"

    # Push branch first
    print()
    info(f"Pushing {current} to origin...")
    r = git(f"push origin {current}", check=False, capture=False)
    if r.returncode != 0:
        warn("Push failed — branch may already exist or need --force-with-lease")
        force = prompt("Push with --force-with-lease?", default="n", options=["y", "n"])
        if force.lower() == "y":
            git(f"push origin {current} --force-with-lease", capture=False)
        else:
            err("Skipping PR creation — push failed.")
            return

    # Create PR
    print()
    info("Creating PR...")
    cmd = f'gh pr create --title "{title}" --base "{base}" {draft_flag} --body "{body}"'
    r = run(cmd, check=False, capture=False)
    if r.returncode != 0:
        # Might already exist
        r2 = run(f"gh pr view {current} --json url -q .url", check=False)
        if r2.returncode == 0:
            ok(f"PR already exists: {r2.stdout.strip()}")
        else:
            err("PR creation failed. Try manually: gh pr create")
    else:
        ok("PR created!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n  {YELLOW}Interrupted.{RESET}")
        sys.exit(0)
