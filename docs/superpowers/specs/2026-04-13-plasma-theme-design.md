# Plasma Theme Design Spec

**Date:** 2026-04-13  
**Status:** Approved — ready for implementation

---

## 1. Vision

A token-first enterprise theme with a signature "plasma" gradient accent — deep black transitioning to vivid plum. One change to a CSS token updates the entire product. Supports two modes:

- **Light mode** — white surfaces, clean layout; the gradient appears only on interactive accents (primary button, active sidebar item)
- **Dark mode** — near-black `#080810` background with subtle purple/magenta plasma blob ambiance; primary button flips to a white gradient

---

## 2. Token Architecture

All theme values live as CSS custom properties in `src/index.css`. Components reference these tokens. To retheme, only the token values change — no component code changes.

### 2a. Plasma Brand Tokens (mode-independent, define once in `:root`)

```css
--plasma-stop-0: #000000;               /* gradient black anchor */
--plasma-stop-1: oklch(0.18 0.1 315);   /* deep plum */
--plasma-stop-2: oklch(0.52 0.26 316);  /* vivid plum */
--plasma-glow: oklch(0.52 0.26 316 / 0.35);
```

### 2b. Button Tokens (override per mode)

| Token | Light | Dark |
|---|---|---|
| `--plasma-btn-bg` | `linear-gradient(135deg, #000 0%, #000 30%, oklch(0.18 0.1 315) 58%, oklch(0.52 0.26 316) 100%)` | `linear-gradient(135deg, #fff 0%, #f4edff 55%, #ecdeff 100%)` |
| `--plasma-btn-color` | `#ffffff` | `oklch(0.22 0.14 312)` |
| `--plasma-btn-shadow` | Black/plum glow | White glow |

### 2c. Active Nav Tokens (override per mode)

| Token | Light | Dark |
|---|---|---|
| `--plasma-nav-active-bg` | Same as `--plasma-btn-bg` | Deep violet-to-rose gradient |
| `--plasma-nav-active-color` | `#ffffff` | `#ffffff` |

### 2d. Semantic Color Tokens

| Token | Light | Dark |
|---|---|---|
| `--plasma-bg` | `#ffffff` | `#080810` |
| `--plasma-surface` | `#ffffff` | `oklch(0.09 0.02 285)` |
| `--plasma-surface-raised` | `#f9f8fc` | `oklch(0.11 0.025 285)` |
| `--plasma-border` | `#e8e2f0` | `oklch(0.99 0 0 / 0.07)` |
| `--plasma-text` | `#1a1020` | `#e8e2f5` |
| `--plasma-text-muted` | `#7a6a9a` | `oklch(0.55 0.06 285)` |
| `--plasma-focus-ring` | `oklch(0.52 0.26 316)` | `oklch(0.62 0.22 310)` |

---

## 3. CSS Utility Classes

Two utility classes added to `index.css` that components import by name:

**`.plasma-btn`** — primary button style
```css
.plasma-btn {
  background: var(--plasma-btn-bg);
  color: var(--plasma-btn-color);
  box-shadow: var(--plasma-btn-shadow);
}
.plasma-btn:hover:not(:disabled) { filter: brightness(1.08); }
.plasma-btn:active:not(:disabled) { filter: brightness(0.95); }
```

**`.plasma-nav-active`** — active sidebar item (applies to all 4 active link groups: main nav, project subnav, settings subnav, recent projects)
```css
.plasma-nav-active {
  background: var(--plasma-nav-active-bg) !important;
  color: var(--plasma-nav-active-color) !important;
}
.plasma-nav-active svg { color: rgba(255,255,255,0.9) !important; }
/* project key badge inside recent projects active item */
.plasma-nav-active span.project-badge { background: rgba(255,255,255,0.18) !important; color: #fff !important; }
```

---

## 4. Dark Mode Background

`body` in `.dark` receives `background-color: var(--plasma-bg)` (`#080810`), replacing the current `#0f172a`. A decorative `body::before` pseudo-element (`position: fixed; inset: 0; z-index: -1; pointer-events: none`) renders the plasma blobs as stacked radial-gradients in a single `background` property with `filter: blur(50px)`:

```css
.dark body::before {
  content: '';
  position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(ellipse 420px 420px at 0% 100%,  oklch(0.45 0.28 310 / 0.45) 0%, transparent 70%),
    radial-gradient(ellipse 360px 360px at 100% 100%, oklch(0.55 0.22 350 / 0.35) 0%, transparent 70%),
    radial-gradient(ellipse 230px 230px at 82% 4%,   oklch(0.50 0.20 290 / 0.12) 0%, transparent 70%);
  filter: blur(50px);
}
```

`body::before` is not rendered (display:none) when `.dark` class is absent.

---

## 5. Files Changed

| File | Change |
|---|---|
| `services/web/src/index.css` | Full plasma token block; `.plasma-btn` + `.plasma-nav-active` classes; dark body BG + blobs; fix broken dark mode variables |
| `services/web/src/components/ui/button.tsx` | `default` variant → `plasma-btn` class; focus ring → `--plasma-focus-ring` |
| `services/web/src/components/layout/sidebar.tsx` | Active item: replace `bg-blue-*` classes → `plasma-nav-active`; inactive hover → plasma-surface tokens |
| `services/web/tailwind.config.ts` | Extend `colors.plasma.*` with CSS variable references so future components can use `bg-plasma-surface` etc. |

---

## 6. What Does NOT Change

- Light mode sidebar and topbar backgrounds remain white (`bg-white`)
- Tailwind gray scale colors throughout the app are untouched
- Rich text editor content styles are untouched
- All non-primary button variants (`secondary`, `outline`, `ghost`, `destructive`) keep their existing styling
- No component other than `button.tsx` and `sidebar.tsx` is modified in this pass

---

## 7. Future Extension

Because everything routes through tokens, future changes are:
- New accent hue: change `--plasma-stop-1`, `--plasma-stop-2`, `--plasma-glow`
- New dark background: change `--plasma-bg` in `.dark`
- Blob intensity: change opacity values on `body::before` children

Components that adopt `bg-plasma-surface`, `text-plasma-text` etc. from Tailwind config will automatically reflect token changes.
