# Activity List — Action Handler Fix

**File:** `services/web/src/components/issues/activity-list.tsx`  
**Date:** 2026-05-06

---

## Problem (Before)

`ActivityEntry` only had two code paths:
1. `action === 'created'` → rendered "X created this issue"
2. Everything else → fell through to the generic field-change renderer

**What broke:**

| Action from API | What rendered | Why broken |
|---|---|---|
| `commented` | **"X changed "** (blank label) | `field` is `null`, so `FIELD_META[null]` is `undefined`, label = `''` |
| `comment_updated` | Same blank render | Same reason |
| `comment_deleted` | Same blank render | Same reason |
| `work_logged` | "X changed timeSpent" | `timeSpent` not in `FIELD_META`, fell back to raw key name |

The comment snippet (stored in `activity.metadata.content`) was **never read or displayed**. The time logged (stored in `activity.metadata.description` + `activity.newValue`) was **never displayed either**.

---

## Fix (After)

Added three new dedicated render branches **before** the generic field-change path:

### `commented` / `comment_updated` / `comment_deleted`
- Renders a `MessageSquare` icon (blue) for add/edit, `Trash2` icon (red) for delete.
- Shows human text: *"added a comment"* / *"edited a comment"* / *"deleted a comment"*.
- Displays a 2-line preview of `activity.metadata.content` for add/edit (not for delete).

### `work_logged`
- Renders a `Clock` icon (teal).
- Formats `activity.newValue` (minutes integer) into `Xh Ym` display.
- Shows `activity.metadata.description` if present.

### `FIELD_META` addition
- Added `timeSpent` entry so it displays correctly if it ever reaches the generic path.

### New imports added
- `MessageSquare`, `Trash2` from `lucide-react`.

---

## Impact

| | Before | After |
|---|---|---|
| Comment added | "X changed " (blank) | "X added a comment" + snippet preview |
| Comment edited | "X changed " (blank) | "X edited a comment" + updated snippet |
| Comment deleted | "X changed " (blank) | "X deleted a comment" (no snippet) |
| Work logged | "X changed timeSpent" | "X logged work · 2h 30m" + description |
| Issue field changes | ✅ worked | ✅ unchanged |
| Issue created | ✅ worked | ✅ unchanged |

No backend changes. No new queries. No breaking changes to existing renders.
