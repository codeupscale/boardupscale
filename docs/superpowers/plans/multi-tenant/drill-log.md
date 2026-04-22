# Rollback Drill Log

Every phase's rollback command is executed on the shadow DB BEFORE that phase ships to production. This log records each drill.

| Date | Phase | Drill | Operator | Outcome | Notes |
|---|---|---|---|---|---|
| _(first entry populated during Phase 0)_ | | | | | |

## Drill procedure template

1. Shadow DB refreshed from latest prod snapshot (if not already)
2. Run the phase's `up()` migration on shadow
3. Verify expected post-state (row counts, new objects, etc.)
4. Execute the documented rollback sequence verbatim
5. Verify shadow now matches pre-phase state (compare counts, spot-check rows)
6. Append entry to the table above with:
   - Date (ISO)
   - Phase (e.g., "Phase 1")
   - Drill type (up-then-down / feature-flag-flip / snapshot-restore)
   - Operator name
   - Outcome (Pass / Fail — Fail means the rollback needed manual fixes, which must be documented)
   - Notes (anything unexpected, timing, edge cases discovered)

## Why this matters

Every Apr 2026 cross-org bug was a "this should never happen" case that happened. Rollback procedures are exactly the same: the one you never drill is the one that fails on the night you need it.
