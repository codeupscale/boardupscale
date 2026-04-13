# Plasma Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Plasma enterprise theme — a token-first CSS variable system with a signature black-to-plum gradient accent on primary buttons and active sidebar items, plus a near-black plasma blob background in dark mode.

**Architecture:** All theme values live as CSS custom properties in `src/index.css`. The `.plasma-btn` and `.plasma-nav-active` utility classes reference those tokens — changing a token updates every consumer instantly. `button.tsx` adopts `.plasma-btn` for its `default` variant; `sidebar.tsx` adopts `.plasma-nav-active` for all active link states. `tailwind.config.ts` exposes the semantic tokens as Tailwind color utilities for future components.

**Tech Stack:** React 18, Tailwind CSS v3.4 (`darkMode: 'class'`), CSS custom properties (oklch), Vite dev server

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `services/web/src/index.css` | Modify | Add plasma token block, `.plasma-btn`, `.plasma-nav-active`, dark body bg, plasma blobs |
| `services/web/src/components/ui/button.tsx` | Modify | `default` variant → `plasma-btn`; focus ring → `--plasma-focus-ring` |
| `services/web/src/components/layout/sidebar.tsx` | Modify | All 4 active link groups → `plasma-nav-active`; project badge → `project-badge` class |
| `services/web/tailwind.config.ts` | Modify | Extend `colors.plasma.*` with CSS variable references |

---

## Task 1: Plasma Token System in index.css

**Files:**
- Modify: `services/web/src/index.css` (lines 20–37 replaced; new block inserted after line 7)

### Context

`index.css` currently has:
- A bare `body { background-color: #f8fafc }` on line 15
- A `:root` block (lines 21–25) with only recharts tooltip tokens
- A `.dark` block (lines 27–31) with recharts dark tokens
- A `.dark body` block (lines 33–37) setting `background-color: #0f172a`

We insert a plasma token block **at the top** (right after the `@tailwind` lines), then update the `.dark body` block to reference the new token.

- [ ] **Step 1: Insert the plasma token block**

In `services/web/src/index.css`, find the line:

```css
* {
  box-sizing: border-box;
}
```

Insert the following block **immediately before** that `*` rule (after the `@tailwind utilities;` line):

```css
/* ============================================================
   PLASMA THEME TOKENS — change here to retheme the whole app
   ============================================================ */

/* Light mode (default) */
:root {
  /* Brand gradient stops */
  --plasma-stop-0: #000000;
  --plasma-stop-1: oklch(0.18 0.1 315);
  --plasma-stop-2: oklch(0.52 0.26 316);
  --plasma-glow: oklch(0.52 0.26 316 / 0.35);

  /* Primary button */
  --plasma-btn-bg: linear-gradient(
    135deg,
    var(--plasma-stop-0) 0%,
    var(--plasma-stop-0) 30%,
    var(--plasma-stop-1) 58%,
    var(--plasma-stop-2) 100%
  );
  --plasma-btn-color: #ffffff;
  --plasma-btn-shadow:
    0 0 0 1px oklch(0.35 0.18 315 / 0.5),
    0 4px 18px rgba(0, 0, 0, 0.35),
    0 0 22px var(--plasma-glow);

  /* Active nav item uses same gradient as button in light mode */
  --plasma-nav-active-bg: var(--plasma-btn-bg);
  --plasma-nav-active-color: #ffffff;

  /* Semantic colors */
  --plasma-bg: #ffffff;
  --plasma-surface: #ffffff;
  --plasma-surface-raised: #f9f8fc;
  --plasma-border: #e8e2f0;
  --plasma-text: #1a1020;
  --plasma-text-muted: #7a6a9a;
  --plasma-focus-ring: oklch(0.52 0.26 316);
}

/* Dark mode overrides */
.dark {
  /* Button flips to white gradient */
  --plasma-btn-bg: linear-gradient(135deg, #ffffff 0%, #f4edff 55%, #ecdeff 100%);
  --plasma-btn-color: oklch(0.22 0.14 312);
  --plasma-btn-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.4),
    0 2px 12px rgba(255, 255, 255, 0.12),
    0 0 20px oklch(0.65 0.22 314 / 0.18);

  /* Active nav in dark uses deep violet-to-rose accent */
  --plasma-nav-active-bg: linear-gradient(
    135deg,
    oklch(0.18 0.12 310) 0%,
    oklch(0.30 0.22 300) 50%,
    oklch(0.45 0.24 350) 100%
  );
  --plasma-nav-active-color: #ffffff;

  /* Semantic colors */
  --plasma-bg: #080810;
  --plasma-surface: oklch(0.09 0.02 285);
  --plasma-surface-raised: oklch(0.11 0.025 285);
  --plasma-border: oklch(0.99 0 0 / 0.07);
  --plasma-text: #e8e2f5;
  --plasma-text-muted: oklch(0.55 0.06 285);
  --plasma-focus-ring: oklch(0.62 0.22 310);
}

/* ── Plasma primary button ── */
.plasma-btn {
  background: var(--plasma-btn-bg) !important;
  color: var(--plasma-btn-color) !important;
  box-shadow: var(--plasma-btn-shadow) !important;
  border: none !important;
}
.plasma-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}
.plasma-btn:active:not(:disabled) {
  filter: brightness(0.95);
}

/* ── Plasma active nav item ── */
.plasma-nav-active {
  background: var(--plasma-nav-active-bg) !important;
  color: var(--plasma-nav-active-color) !important;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
}
.plasma-nav-active svg {
  color: rgba(255, 255, 255, 0.9) !important;
}
.plasma-nav-active .project-badge {
  background: rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
}
```

- [ ] **Step 2: Update `.dark body` to use plasma token**

In `services/web/src/index.css`, find the block:

```css
/* Dark mode body */
.dark body {
  background-color: #0f172a;
  color: #e2e8f0;
}
```

Replace it with:

```css
/* Dark mode body */
.dark body {
  background-color: var(--plasma-bg);
  color: var(--plasma-text);
}

/* Dark mode plasma background blobs (decorative, pointer-events none) */
.dark body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(ellipse 420px 420px at 0% 100%,   oklch(0.45 0.28 310 / 0.45) 0%, transparent 70%),
    radial-gradient(ellipse 360px 360px at 100% 100%, oklch(0.55 0.22 350 / 0.35) 0%, transparent 70%),
    radial-gradient(ellipse 230px 230px at 82% 4%,    oklch(0.50 0.20 290 / 0.12) 0%, transparent 70%);
  filter: blur(50px);
}
```

- [ ] **Step 3: Update the light-mode body background to use the plasma token**

In `services/web/src/index.css`, find:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background-color: #f8fafc;
  color: #111827;
  margin: 0;
}
```

Replace with:

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif;
  background-color: var(--plasma-bg);
  color: var(--plasma-text);
  margin: 0;
}
```

Note: Having multiple `:root {}` and `.dark {}` blocks in CSS is valid — the browser merges them. The existing recharts `:root` / `.dark` block (lines ~21–31) can stay exactly as-is. No changes needed there.

- [ ] **Step 4: Verify the dev server compiles without errors**

```bash
cd services/web && npm run dev
```

Expected: Server starts at `http://localhost:3000` with no console errors. Open in browser, toggle dark mode. You should see:
- Dark mode: near-black background (`#080810`) with subtle purple/violet blobs at the corners
- Light mode: white background (unchanged)

- [ ] **Step 5: Commit**

```bash
git add services/web/src/index.css
git commit -m "feat: add plasma theme token system and utility classes"
```

---

## Task 2: Update Button Component

**Files:**
- Modify: `services/web/src/components/ui/button.tsx` (lines 25–34)

### Context

Current `button.tsx` structure (full file shown for reference):
```tsx
import { forwardRef, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg' | 'icon-sm'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      isLoading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const base =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed gap-2'

    const variants = {
      default: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
      secondary: 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600',
      outline: 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700',
      ghost: 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700',
      destructive: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
    }

    const sizes = {
      sm: 'h-8 px-3 text-sm',
      md: 'h-9 px-4 text-sm',
      lg: 'h-10 px-5 text-base',
      'icon-sm': 'h-8 w-8 p-0 text-sm',
    }

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? <Spinner className="h-4 w-4" /> : null}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
```

- [ ] **Step 1: Update `base` string — swap focus ring from blue to plasma token**

Find:
```ts
    const base =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed gap-2'
```

Replace with:
```ts
    const base =
      'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--plasma-focus-ring)] dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed gap-2'
```

- [ ] **Step 2: Update `default` variant to use `.plasma-btn`**

Find:
```ts
      default: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
```

Replace with:
```ts
      default: 'plasma-btn',
```

- [ ] **Step 3: Verify in dev server**

With the dev server still running (`npm run dev` from Task 1):
1. Open any page that has a primary (default) button — e.g., the Login page or any modal with a submit button
2. **Light mode**: Button should show a black-to-plum gradient (black on left, fading to vivid purple on right)
3. **Dark mode**: Button should show a white-to-lavender gradient with a subtle white glow
4. Hover on the button: should slightly brighten
5. Tab to the button: focus ring should be a purple/plum outline (not blue)

- [ ] **Step 4: Commit**

```bash
git add services/web/src/components/ui/button.tsx
git commit -m "feat: plasma gradient on primary button"
```

---

## Task 3: Update Sidebar Active States

**Files:**
- Modify: `services/web/src/components/layout/sidebar.tsx` (lines 148–278)

### Context

The sidebar has **4 independent active link groups**, each with its own `active ? 'bg-blue-...' : '...'` conditional. All 4 must be updated. The sidebar background itself stays white in light / dark-gray in dark — only the active **item** gets the gradient.

Also note: the `<Icon>` inside each active link currently gets an explicit `text-blue-600` class. When the parent has `.plasma-nav-active`, the CSS rule `.plasma-nav-active svg { color: rgba(255,255,255,0.9) }` takes over — so remove the active-state icon color class entirely (keep only the inactive-state class).

- [ ] **Step 1: Update Group 1 — Main nav items (line ~151)**

Find this className expression on the `<Link>` for main nav items:
```tsx
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/20 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                  !isSidebarOpen && 'justify-center px-2',
                )}
```

Replace with:
```tsx
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                  active
                    ? 'plasma-nav-active shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                  !isSidebarOpen && 'justify-center px-2',
                )}
```

Find the `<Icon>` inside this same main-nav link:
```tsx
                <Icon
                  className={cn('h-5 w-5 flex-shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')}
                />
```

Replace with:
```tsx
                <Icon
                  className={cn('h-5 w-5 flex-shrink-0', active ? '' : 'text-gray-400 dark:text-gray-500')}
                />
```

- [ ] **Step 2: Update Group 2 — Project sub-navigation (line ~191)**

Find this className on the project subnav `<Link>`:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      active
                        ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/25 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Replace with:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      active
                        ? 'plasma-nav-active font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Find the `<Icon>` inside the project subnav link:
```tsx
                    <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500')} />
```

Replace with:
```tsx
                    <Icon className={cn('h-4 w-4 flex-shrink-0', active ? '' : 'text-gray-400 dark:text-gray-500')} />
```

- [ ] **Step 3: Update Group 3 — Settings sub-navigation (line ~224)**

Find this className on the settings subnav `<Link>`:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      active
                        ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/25 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Replace with:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      active
                        ? 'plasma-nav-active font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Find the `<Icon>` inside the settings subnav link:
```tsx
                    <Icon
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500',
                      )}
                    />
```

Replace with:
```tsx
                    <Icon
                      className={cn(
                        'h-4 w-4 flex-shrink-0',
                        active ? '' : 'text-gray-400 dark:text-gray-500',
                      )}
                    />
```

- [ ] **Step 4: Update Group 4 — Recent Projects (lines ~257–278)**

Find the recent-projects `<Link>` className:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      isProjectActive
                        ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/25 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Replace with:
```tsx
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all duration-150',
                      isProjectActive
                        ? 'plasma-nav-active font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:text-gray-900 dark:hover:text-gray-200',
                    )}
```

Find the project key badge `<span>` inside the recent projects link:
```tsx
                    <span className={cn(
                      'h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                      isProjectActive
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    )}>
```

Replace with:
```tsx
                    <span className={cn(
                      'h-5 w-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0 project-badge',
                      isProjectActive
                        ? ''
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400',
                    )}>
```

- [ ] **Step 5: Verify in dev server**

1. Log in and navigate to any page
2. **Main nav**: Click "Dashboard" — it should show the black-to-plum gradient background with white icon and text
3. **Project subnav**: Open a project, click "Board" — same gradient treatment
4. **Recent projects**: The active project in the list should have gradient highlight; the key badge shows on a glass-white chip
5. **Dark mode**: Toggle dark mode — active items switch to a deep violet-to-rose gradient (instead of the plum gradient)
6. **Collapsed sidebar**: Icons-only mode — verify active icon still shows correctly (justified center, gradient background on the icon pill)

- [ ] **Step 6: Commit**

```bash
git add services/web/src/components/layout/sidebar.tsx
git commit -m "feat: plasma gradient on active sidebar nav items"
```

---

## Task 4: Extend Tailwind Config with Plasma Color Utilities

**Files:**
- Modify: `services/web/tailwind.config.ts` (full file)

### Context

Current file:
```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
```

This adds `bg-plasma-bg`, `bg-plasma-surface`, `text-plasma-text` etc. as Tailwind utilities. These are wired to the CSS variables, so they automatically adapt to light/dark mode. Future components should use these instead of hardcoded `bg-white dark:bg-gray-900` combos.

- [ ] **Step 1: Add plasma colors to tailwind.config.ts**

Replace the entire file contents with:

```ts
import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        // Plasma theme tokens — these adapt automatically to light/dark via CSS variables.
        // Use these in new components: bg-plasma-surface, text-plasma-text, etc.
        plasma: {
          bg:             'var(--plasma-bg)',
          surface:        'var(--plasma-surface)',
          'surface-raised': 'var(--plasma-surface-raised)',
          border:         'var(--plasma-border)',
          text:           'var(--plasma-text)',
          'text-muted':   'var(--plasma-text-muted)',
          ring:           'var(--plasma-focus-ring)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 2: Verify Tailwind picks up the new tokens**

```bash
cd services/web && npm run build 2>&1 | tail -10
```

Expected: Build completes without errors. The `plasma-*` color utilities are now available for use in any component className.

- [ ] **Step 3: Commit**

```bash
git add services/web/tailwind.config.ts
git commit -m "feat: expose plasma CSS tokens as Tailwind color utilities"
```

---

## Final Verification Checklist

After all 4 tasks are committed:

- [ ] `npm run build` in `services/web` passes with no TypeScript or Vite errors
- [ ] Dev server: primary buttons throughout the app (login, modals, forms) show the black-to-plum gradient
- [ ] Dev server: active sidebar items show the plasma gradient with white text/icons
- [ ] Dev server: dark mode body background is `#080810` with visible violet/rose blobs in bottom corners
- [ ] Dev server: dark mode primary buttons show white-to-lavender gradient
- [ ] Dev server: light mode sidebar and topbar remain white (no gradient on backgrounds)
- [ ] Git log shows 4 clean commits

---

## How to Retheme in the Future

To change the accent color (e.g., from plum to teal):
1. Open `services/web/src/index.css`
2. Change `--plasma-stop-1` and `--plasma-stop-2` under `:root`
3. Change the `.dark` nav active gradient colors
4. Done — buttons, active sidebar items, focus rings all update automatically
