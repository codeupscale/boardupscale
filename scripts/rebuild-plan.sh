#!/usr/bin/env bash
# Regenerate docs/superpowers/plans/multi-tenant/PLAN.md from its source files.
# Called by .github/workflows/sync-main-to-multi-tenant.yml after each merge
# from main, and can be run locally anytime you edit a phase file.
#
# Usage: bash scripts/rebuild-plan.sh

set -euo pipefail

PLAN_DIR="docs/superpowers/plans/multi-tenant"
SPEC_FILE="docs/superpowers/specs/2026-04-22-multi-tenant-architecture.md"
OUT="$PLAN_DIR/PLAN.md"

if [[ ! -d "$PLAN_DIR" ]]; then
  echo "ERROR: $PLAN_DIR not found — are you at the repo root?" >&2
  exit 1
fi

{
  cat <<'HEADER'
# Multi-Tenant Architecture — Complete Plan (Consolidated)

> **This is the single-file view.** All content below is also in the individual files under `docs/superpowers/plans/multi-tenant/` and `docs/superpowers/specs/` — this document just stitches them together in reading order so you can review the full plan top-to-bottom.
>
> **Branch:** this work lives on `feat/multi-tenant-v2`. Main stays free for bug fixes and feature work. The branch auto-syncs from `main` daily via `.github/workflows/sync-main-to-multi-tenant.yml`.
>
> **Last updated:** auto-regenerated from source files each time the branch builds.

---

## Contents

1. [Design — Architecture, Scenarios, Edge Cases](#part-1--design-spec)
2. [Master Plan — Phase Overview + Invariants](#part-2--master-plan)
3. [Testing Strategy](#part-3--testing-strategy)
4. [Phase 0 — Drift Audit + Perf Baseline](#phase-0--drift-audit--perf-baseline)
5. [Phase 0.5 — Production Data Cleanup](#phase-05--production-data-cleanup)
6. [Phase 1 — Additive Schema + Backfill](#phase-1--additive-schema--backfill)
7. [Phase 2 — Dual-Write](#phase-2--dual-write)
8. [Phase 3 — Flip Reads (9 subphases)](#phase-3--flip-reads-9-subphases)
9. [Phase 4 — Freeze Legacy Writes](#phase-4--freeze-legacy-writes)
10. [Phase 5 — Drop Legacy Columns](#phase-5--drop-legacy-columns)
11. [Phase 6 — Post-Work](#phase-6--post-work)
12. [Rollback Drill Log](#rollback-drill-log)

---

# PART 1 — Design Spec

HEADER

  cat "$SPEC_FILE"
  printf '\n---\n\n# PART 2 — Master Plan\n\n'
  cat "$PLAN_DIR/README.md"
  printf '\n---\n\n# PART 3 — Testing Strategy\n\n'
  cat "$PLAN_DIR/testing-strategy.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-0-drift-audit.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-0.5-data-cleanup.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-1-additive-schema.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-2-dual-write.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-3-flip-reads.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-4-freeze-writes.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-5-drop-columns.md"
  printf '\n---\n\n'
  cat "$PLAN_DIR/phase-6-post-work.md"
  printf '\n---\n\n# Rollback Drill Log\n\n'
  cat "$PLAN_DIR/drill-log.md"
} > "$OUT"

echo "Rebuilt $OUT ($(wc -l < "$OUT") lines)"
