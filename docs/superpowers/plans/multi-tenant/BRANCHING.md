# Branching & Parallel-Work Contract

This document describes how the multi-tenant refactor branch (`feat/multi-tenant-v2`) coexists with day-to-day production work on `main`.

---

## The two workstreams

| Workstream | Branch | Purpose |
|---|---|---|
| **Production** | `main` | Bug fixes, small features, anything customer-visible that isn't the refactor. Deployed on every merge. |
| **Architecture refactor** | `feat/multi-tenant-v2` | The 9-phase multi-tenant transition. NOT deployed from this branch. Each completed phase merges back to `main` via its own PR. |

---

## Golden rules

1. **`main` is always deployable.** Every commit on main passes CI and is safe to deploy. This is unchanged.

2. **`feat/multi-tenant-v2` auto-syncs from `main` every 6 hours and on every push to `main`.** Github Actions (`.github/workflows/sync-main-to-multi-tenant.yml`) merges main into the branch. Merge conflicts open an issue labeled `sync-conflict` for manual resolution.

3. **New bug fixes go on `main`.** Do NOT branch off `feat/multi-tenant-v2` for unrelated fixes. The sync job brings them into the branch automatically.

4. **Architecture work is developed on sub-branches off `feat/multi-tenant-v2`.** For each phase:
   ```bash
   git checkout feat/multi-tenant-v2
   git pull
   git checkout -b phase-0.5/data-cleanup
   # ...do the work...
   git push -u origin phase-0.5/data-cleanup
   # Open PR: phase-0.5/data-cleanup → feat/multi-tenant-v2
   ```

5. **Each phase eventually merges back to `main`.** Once a phase is validated on a shadow DB and passes the test contract in `testing-strategy.md`, open a PR from `feat/multi-tenant-v2` → `main` that contains just that phase's commits. Cherry-pick or rebase as needed to keep the PR scoped. The PR title follows `phase-N: <short name>`.

6. **`PLAN.md` is auto-regenerated on every sync.** Do not edit `PLAN.md` directly — edit the individual phase files in `docs/superpowers/plans/multi-tenant/` and `scripts/rebuild-plan.sh` will rebuild it.

---

## Daily workflow

### On `main` (normal work)

```bash
git checkout main
git pull
git checkout -b fix/some-bug
# ...work...
git commit -am "fix: some bug"
git push -u origin fix/some-bug
# Open PR to main; merge when CI passes.
```

After merge, the sync workflow brings the change into `feat/multi-tenant-v2` within minutes.

### On `feat/multi-tenant-v2` (architecture work)

```bash
git checkout feat/multi-tenant-v2
git pull                                # always starts from latest
git checkout -b phase-0.5/data-cleanup  # or whichever phase
# ...work...
git commit -am "phase 0.5: add audit queries"
git push -u origin phase-0.5/data-cleanup
# Open PR: phase-0.5/data-cleanup → feat/multi-tenant-v2
# Review + merge into feat/multi-tenant-v2.
# Once the phase passes all tests + drill, open a second PR:
#   feat/multi-tenant-v2 → main  (scoped to this phase's commits only)
```

---

## What if `feat/multi-tenant-v2` gets badly out of sync?

If a conflict auto-issue sits open for > 48h, rebase the branch onto main:

```bash
git checkout feat/multi-tenant-v2
git fetch origin
git rebase origin/main
# resolve conflicts commit by commit
git push --force-with-lease origin feat/multi-tenant-v2
```

`--force-with-lease` is safer than `--force`: it refuses to overwrite if someone else pushed in the meantime.

---

## Visibility

- The consolidated `PLAN.md` lives on `feat/multi-tenant-v2` and is always readable.
- The drill log (`drill-log.md`) records every rollback test.
- Per-phase PRs back to main create a natural audit trail.

---

## When `feat/multi-tenant-v2` gets deleted

Once Phase 6 completes and the refactor is fully on main:

```bash
git push origin --delete feat/multi-tenant-v2
```

Delete the sync workflow in the same PR. Archive the plan files under `docs/superpowers/plans/archive/multi-tenant-v2/` for historical reference.
