# Migration Progress UI Polish — Design Spec

**Goal:** Fix 7 specific visual issues in the `ProgressStep` component to make the migration progress screen clearer and more attractive.

**Architecture:** All changes are confined to `services/web/src/pages/migrate/steps/ProgressStep.tsx`. No new files, no new dependencies, no layout restructure.

**Tech Stack:** React 18, Tailwind CSS, Lucide icons

---

## Changes

### 1. Progress badge colour
- **Problem:** Badge uses `bg-primary/10 text-primary` which renders in the theme accent colour (pink/red), not matching the blue progress bar.
- **Fix:** Replace with explicit `bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400` for the running state.

### 2. Progress bar shimmer animation
- **Problem:** Static bar gives no sense of live activity.
- **Fix:** When `isActive`, render a `<span>` overlay inside the bar with `animate-pulse opacity-30 bg-white` sliding right via `bg-gradient-to-r from-transparent via-white/40 to-transparent` and `animate-[shimmer_1.5s_infinite]`. Add the keyframe via a `<style>` tag at component top or use Tailwind `animate-pulse` on a white overlay band.

### 3. Stat tiles — hierarchy & sizing
- **Problem:** Icon, count, "of X" and label stack in 4 tiny lines inside `p-2`; hierarchy unclear.
- **Fix:**
  - Pad to `p-3`
  - Count: `text-base font-bold`
  - "of X" inline next to count: `{val.toLocaleString()} / {total.toLocaleString()}` (single line)
  - Label: `text-[10px] text-muted-foreground mt-0.5`
  - Icon: wrap in `h-6 w-6 rounded-md flex items-center justify-center` with phase colour bg (`bg-indigo-50 dark:bg-indigo-900/20` etc.)

### 4. Throughput tile overflow
- **Problem:** "Calculating..." overflows the Remaining tile into adjacent tile.
- **Fix:**
  - Add `min-w-0 overflow-hidden` to each tile
  - Value `<p>`: add `truncate` class + `title` attribute with full value
  - For strings > 6 chars, apply `text-xs` instead of `text-sm font-bold` (conditional class)

### 5. Throughput label clarity
- **Problem:** "Queue Act/Wait", "Process RSS", "DB Conns" are cryptic.
- **Fix:** Rename to "Queue Jobs", "Proc Memory", "DB Pool" with full names in `title` tooltip attributes.

### 6. Sync phase status badges
- **Problem:** "Done" is plain green text; running state shows plain coloured percentage; pending is invisible.
- **Fix:**
  - Done: `<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">`
  - Running: same pill shape in phase colour
  - Pending: `<span className="text-[10px] text-muted-foreground/50">Waiting</span>`

### 7. Panel section visual hierarchy
- **Problem:** All panels (Throughput, System, Phases, Log) look identical weight.
- **Fix:** Add `border-l-2 border-primary/30` to the left side of each panel header `<div>` (the `px-4 py-3 border-b` div), plus `pl-3` padding adjustment so the label sits 3px from the accent line.

---

## Files Changed
- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx`

## Out of Scope
- No changes to `JiraMigrationPage.tsx`, `SystemPanel`, `ThroughputPanel` structure, hooks, or other steps.
