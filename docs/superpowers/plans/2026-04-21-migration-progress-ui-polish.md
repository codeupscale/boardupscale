# Migration Progress UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 visual issues in the migration progress screen — badge colour, shimmer animation, stat tile hierarchy, throughput overflow, label clarity, phase badges, and panel header accents.

**Architecture:** All changes are in one file: `services/web/src/pages/migrate/steps/ProgressStep.tsx`. No new files. Each task is a self-contained visual fix that can be committed independently.

**Tech Stack:** React 18, Tailwind CSS v3, Lucide icons

---

## File Structure

- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx`

---

### Task 1: Fix progress badge colour + add shimmer animation

**Files:**
- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx` (lines ~451–469)

**Context:** The overall progress card has two problems: the running-state badge uses `bg-primary/10 text-primary` (renders pink/red in this theme, not blue), and the progress bar is static while the migration is live.

- [ ] **Step 1: Fix the badge colour**

Find this block (inside the Overall progress card `div`):

```tsx
<span className={cn(
  'text-xs font-semibold px-2 py-0.5 rounded-full',
  isCompleted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : isFailed ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    : 'bg-primary/10 text-primary dark:text-primary',
)}>
  {isCompleted ? 'Complete' : isFailed ? 'Failed' : `${overallPct}%`}
</span>
```

Replace the last branch `'bg-primary/10 text-primary dark:text-primary'` with explicit blue:

```tsx
<span className={cn(
  'text-xs font-semibold px-2 py-0.5 rounded-full',
  isCompleted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : isFailed ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
)}>
  {isCompleted ? 'Complete' : isFailed ? 'Failed' : `${overallPct}%`}
</span>
```

- [ ] **Step 2: Add shimmer overlay to the progress bar**

Find this block:

```tsx
<div className="h-3 bg-muted rounded-full overflow-hidden">
  <div
    className={cn(
      'h-full rounded-full transition-all duration-700',
      isFailed ? 'bg-red-500' : isCompleted ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-indigo-500',
    )}
    style={{ width: `${overallPct}%` }}
  />
</div>
```

Replace with a relative container + shimmer overlay:

```tsx
<div className="h-3 bg-muted rounded-full overflow-hidden relative">
  <div
    className={cn(
      'h-full rounded-full transition-all duration-700 relative overflow-hidden',
      isFailed ? 'bg-red-500' : isCompleted ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-blue-600 to-indigo-500',
    )}
    style={{ width: `${overallPct}%` }}
  >
    {isActive && (
      <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_1.8s_ease-in-out_infinite]" />
    )}
  </div>
</div>
```

- [ ] **Step 3: Add the shimmer keyframe**

Add this `<style>` block at the very top of the `ProgressStep` function return, before the wrapping `<div className="space-y-5">`:

```tsx
return (
  <div className="space-y-5">
    <style>{`
      @keyframes shimmer {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
    `}</style>
    {/* Header */}
    ...
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd services/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/migrate/steps/ProgressStep.tsx
git commit -m "fix: correct progress badge colour and add shimmer animation"
```

---

### Task 2: Improve stat tiles hierarchy and sizing

**Files:**
- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx` (lines ~471–486)

**Context:** The 5 stat tiles (Projects, Issues, Members, Sprints, Comments) are cramped (`p-2`), show the count and "of X" on separate lines making them hard to scan, and the icon is bare with no background.

- [ ] **Step 1: Replace the stats row**

Find this block:

```tsx
{/* Stats row */}
<div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
  {[
    { label: 'Projects', val: liveCounts.processedProjects, total: liveCounts.totalProjects, icon: FolderOpen, color: 'text-primary' },
    { label: 'Issues', val: liveCounts.processedIssues, total: liveCounts.totalIssues, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400' },
    { label: 'Members', val: liveCounts.processedMembers, total: liveCounts.totalMembers, icon: Users, color: 'text-violet-600 dark:text-violet-400' },
    { label: 'Sprints', val: liveCounts.processedSprints, total: liveCounts.totalSprints, icon: Zap, color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Comments', val: liveCounts.processedComments, total: liveCounts.totalComments, icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400' },
  ].map(({ label, val, total, icon: Icon, color }) => (
    <div key={label} className="bg-muted/50 rounded-lg p-2 text-center">
      <Icon className={cn('h-3.5 w-3.5 mx-auto mb-1', color)} />
      <div className="text-sm font-bold text-foreground">{val.toLocaleString()}</div>
      {total > 0 && <div className="text-[10px] text-muted-foreground">of {total.toLocaleString()}</div>}
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  ))}
</div>
```

Replace with:

```tsx
{/* Stats row */}
<div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
  {[
    { label: 'Projects', val: liveCounts.processedProjects, total: liveCounts.totalProjects, icon: FolderOpen, color: 'text-primary', iconBg: 'bg-primary/10' },
    { label: 'Issues', val: liveCounts.processedIssues, total: liveCounts.totalIssues, icon: FileText, color: 'text-indigo-600 dark:text-indigo-400', iconBg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { label: 'Members', val: liveCounts.processedMembers, total: liveCounts.totalMembers, icon: Users, color: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-50 dark:bg-violet-900/20' },
    { label: 'Sprints', val: liveCounts.processedSprints, total: liveCounts.totalSprints, icon: Zap, color: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-50 dark:bg-amber-900/20' },
    { label: 'Comments', val: liveCounts.processedComments, total: liveCounts.totalComments, icon: MessageSquare, color: 'text-teal-600 dark:text-teal-400', iconBg: 'bg-teal-50 dark:bg-teal-900/20' },
  ].map(({ label, val, total, icon: Icon, color, iconBg }) => (
    <div key={label} className="bg-muted/50 rounded-lg p-3 text-center">
      <div className={cn('h-7 w-7 rounded-md flex items-center justify-center mx-auto mb-2', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', color)} />
      </div>
      <div className="text-base font-bold text-foreground leading-none">
        {val.toLocaleString()}
        {total > 0 && (
          <span className="text-[10px] font-normal text-muted-foreground ml-1">/ {total.toLocaleString()}</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{label}</div>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd services/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/pages/migrate/steps/ProgressStep.tsx
git commit -m "fix: improve stat tile hierarchy and sizing in progress card"
```

---

### Task 3: Fix Throughput overflow, clarify System labels, add panel header accents

**Files:**
- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx` — `ThroughputPanel` (lines ~199–254), `SystemPanel` (lines ~104–197)

**Context:** Three sub-fixes here:
1. `ThroughputPanel` tiles have no overflow guard — "Calculating..." spills into the adjacent tile.
2. `SystemPanel` detail labels ("Process RSS", "DB Conns", "Queue Act/Wait") are cryptic abbreviations.
3. All panel headers look identical — adding a left-border accent differentiates them.

- [ ] **Step 1: Fix ThroughputPanel tile overflow**

Find the 4-tile grid inside `ThroughputPanel`:

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {/* Elapsed */}
  <div className="bg-muted/50 rounded-lg p-3 text-center">
    <Timer className="h-4 w-4 mx-auto mb-1.5 text-blue-500" />
    <p className="text-sm font-bold text-foreground">
      {formatDurationShort(throughput.elapsedSeconds)}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Elapsed</p>
  </div>
  {/* ETA */}
  <div className="bg-muted/50 rounded-lg p-3 text-center">
    <Clock className="h-4 w-4 mx-auto mb-1.5 text-amber-500" />
    <p className="text-sm font-bold text-foreground">
      {formatEta(throughput.etaMinutes)}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Remaining</p>
  </div>
  {/* Issues/min */}
  <div className="bg-muted/50 rounded-lg p-3 text-center">
    <TrendingUp className="h-4 w-4 mx-auto mb-1.5 text-indigo-500" />
    <p className="text-sm font-bold text-foreground">
      {throughput.issuesPerMin > 0 ? `${throughput.issuesPerMin}/min` : '--'}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Issue Rate</p>
  </div>
  {/* Total processed */}
  <div className="bg-muted/50 rounded-lg p-3 text-center">
    <Zap className="h-4 w-4 mx-auto mb-1.5 text-green-500" />
    <p className="text-sm font-bold text-foreground">
      {totalProcessed.toLocaleString()}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Total Synced</p>
  </div>
</div>
```

Replace with (adds `min-w-0 overflow-hidden` per tile and `truncate` + adaptive font size on value `<p>`):

```tsx
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {/* Elapsed */}
  <div className="bg-muted/50 rounded-lg p-3 text-center min-w-0 overflow-hidden">
    <Timer className="h-4 w-4 mx-auto mb-1.5 text-blue-500" />
    <p className="text-sm font-bold text-foreground truncate" title={formatDurationShort(throughput.elapsedSeconds)}>
      {formatDurationShort(throughput.elapsedSeconds)}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Elapsed</p>
  </div>
  {/* ETA */}
  <div className="bg-muted/50 rounded-lg p-3 text-center min-w-0 overflow-hidden">
    <Clock className="h-4 w-4 mx-auto mb-1.5 text-amber-500" />
    <p
      className={cn('font-bold text-foreground truncate', formatEta(throughput.etaMinutes).length > 6 ? 'text-xs' : 'text-sm')}
      title={formatEta(throughput.etaMinutes)}
    >
      {formatEta(throughput.etaMinutes)}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Remaining</p>
  </div>
  {/* Issues/min */}
  <div className="bg-muted/50 rounded-lg p-3 text-center min-w-0 overflow-hidden">
    <TrendingUp className="h-4 w-4 mx-auto mb-1.5 text-indigo-500" />
    <p className="text-sm font-bold text-foreground truncate">
      {throughput.issuesPerMin > 0 ? `${throughput.issuesPerMin}/min` : '--'}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Issue Rate</p>
  </div>
  {/* Total processed */}
  <div className="bg-muted/50 rounded-lg p-3 text-center min-w-0 overflow-hidden">
    <Zap className="h-4 w-4 mx-auto mb-1.5 text-green-500" />
    <p className="text-sm font-bold text-foreground truncate">
      {totalProcessed.toLocaleString()}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">Total Synced</p>
  </div>
</div>
```

- [ ] **Step 2: Clarify SystemPanel detail grid labels**

Find the detail grid inside `SystemPanel`:

```tsx
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Cpu className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.system.loadAverage[0].toFixed(2)}
  </p>
  <p className="text-[10px] text-muted-foreground">Load (1m)</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <HardDrive className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {formatBytes(metrics.process.rss)}
  </p>
  <p className="text-[10px] text-muted-foreground">Process RSS</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Database className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.database.active}/{metrics.database.total}
  </p>
  <p className="text-[10px] text-muted-foreground">DB Conns</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Activity className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.queue.active} / {metrics.queue.waiting}
  </p>
  <p className="text-[10px] text-muted-foreground">Queue Act/Wait</p>
</div>
```

Replace with renamed labels and `title` tooltips:

```tsx
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Cpu className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.system.loadAverage[0].toFixed(2)}
  </p>
  <p className="text-[10px] text-muted-foreground" title="1-minute load average">Load (1m)</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <HardDrive className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {formatBytes(metrics.process.rss)}
  </p>
  <p className="text-[10px] text-muted-foreground" title="Process resident set size">Proc Memory</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Database className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.database.active}/{metrics.database.total}
  </p>
  <p className="text-[10px] text-muted-foreground" title="Active / total database connections">DB Pool</p>
</div>
<div className="bg-muted/50 rounded-lg p-2.5 text-center">
  <Activity className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
  <p className="text-xs font-semibold text-foreground">
    {metrics.queue.active} / {metrics.queue.waiting}
  </p>
  <p className="text-[10px] text-muted-foreground" title="Active / waiting queue jobs">Queue Jobs</p>
</div>
```

- [ ] **Step 3: Add left-border accent to all 4 panel headers**

There are 4 panel header divs — in `SystemPanel`, `ThroughputPanel`, the Sync Phases section, and the Activity Log section. Each looks like:

```tsx
<div className="px-4 py-3 border-b border-border flex items-center gap-2">
```

Change **all four** to add `border-l-2 border-primary/30 pl-3` (and drop the original `px-4` left padding so it doesn't double-pad — use `pr-4` instead):

```tsx
<div className="pl-3 pr-4 py-3 border-b border-border border-l-2 border-l-primary/30 flex items-center gap-2">
```

The four locations are:
1. `SystemPanel` — header containing `<Activity />` icon + "System Utilization"
2. `ThroughputPanel` — header containing `<Gauge />` icon + "Throughput & ETA"
3. Sync Phases section in `ProgressStep` — header containing "Sync Phases"
4. Activity Log section — header containing `<TrendingUp />` icon + "Activity Log"

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd services/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add services/web/src/pages/migrate/steps/ProgressStep.tsx
git commit -m "fix: throughput overflow, clarify system labels, add panel header accents"
```

---

### Task 4: Upgrade sync phase status badges

**Files:**
- Modify: `services/web/src/pages/migrate/steps/ProgressStep.tsx` (lines ~549–570)

**Context:** The phase status indicators are plain text — "Done" in green, percentage in phase colour, "Pending" barely visible. Replacing with pill badges gives each state clear visual weight.

- [ ] **Step 1: Replace phase status indicators**

Find this block inside the `PHASES.map(...)` return, in the right-side status section:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {isRunning && total > 0 && (
    <span className="text-xs font-mono text-muted-foreground">
      {processed.toLocaleString()} / {total.toLocaleString()}
    </span>
  )}
  {isDone && duration && (
    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
      <Clock className="h-3 w-3" />{duration}
    </span>
  )}
  {isDone && !duration && (
    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Done</span>
  )}
  {isRunning && (
    <span className={cn('text-xs font-medium', phase.color.split(' ')[0])}>
      {total > 0 ? `${pct}%` : 'Running...'}
    </span>
  )}
  {isPending && (
    <span className="text-xs text-muted-foreground/60">Pending</span>
  )}
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 flex-shrink-0">
  {isRunning && total > 0 && (
    <span className="text-[10px] font-mono text-muted-foreground">
      {processed.toLocaleString()} / {total.toLocaleString()}
    </span>
  )}
  {isDone && duration && (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
      <Clock className="h-3 w-3" />{duration}
    </span>
  )}
  {isDone && !duration && (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
      Done
    </span>
  )}
  {isRunning && (
    <span className={cn(
      'text-[10px] font-semibold px-2 py-0.5 rounded-full',
      phase.bgColor,
      phase.color.split(' ')[0],
    )}>
      {total > 0 ? `${pct}%` : 'Running…'}
    </span>
  )}
  {isPending && (
    <span className="text-[10px] text-muted-foreground/40">Waiting</span>
  )}
</div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd services/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add services/web/src/pages/migrate/steps/ProgressStep.tsx
git commit -m "fix: upgrade sync phase status indicators to pill badges"
```

---

## Self-Review

**Spec coverage check:**
1. Progress badge colour → Task 1 Step 1 ✅
2. Shimmer animation → Task 1 Steps 2–3 ✅
3. Stat tiles hierarchy → Task 2 ✅
4. Throughput overflow → Task 3 Step 1 ✅
5. Label clarity → Task 3 Steps 2 ✅
6. Phase badges → Task 4 ✅
7. Panel header accents → Task 3 Step 3 ✅

**Placeholder scan:** No TBDs, all code complete ✅

**Type consistency:** `phase.bgColor`, `phase.color` are used consistently from `PhaseConfig` throughout — same property names in Task 4 as defined at file top ✅
