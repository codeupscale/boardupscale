# shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 17 custom UI components in `src/components/ui/` with shadcn/ui (Radix UI-backed) equivalents, install Tailwind v4 with CSS variable theming, and migrate the toast system to Sonner — leaving a consistent, accessible, dark-mode-ready design system.

**Architecture:** Tailwind v4 is installed via its Vite plugin (no `postcss.config.js`, no `tailwind.config.ts`). shadcn components land in `src/components/ui/` as source files; we keep identical external APIs on top of Radix primitives so consumer files need minimal changes. Only Select, Dialog, and DropdownMenu require structural consumer updates.

**Tech Stack:** Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui (Radix UI), Sonner, `tw-animate-css`, `class-variance-authority`, `lucide-react` (already installed), `react-day-picker` v8 (installed by shadcn Calendar)

---

## Working Directory

All commands run from:
```
/path/to/boardupscale/.worktrees/ui-ux-overhaul/services/web
```

---

## Task 1: Install Tailwind v4

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `src/index.css`
- Delete: `tailwind.config.ts`
- Delete: `postcss.config.js`

- [ ] **Step 1: Uninstall Tailwind v3 and PostCSS plugins**

```bash
npm uninstall tailwindcss autoprefixer postcss
```

Expected output: `removed N packages`

- [ ] **Step 2: Install Tailwind v4 + Vite plugin**

```bash
npm install tailwindcss@latest @tailwindcss/vite
```

- [ ] **Step 3: Install shadcn peer deps needed later**

```bash
npm install class-variance-authority tw-animate-css
```

- [ ] **Step 4: Update `vite.config.ts` to use Tailwind v4 Vite plugin**

Replace the entire file:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  cacheDir: 'node_modules/.vite',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 5: Replace `src/index.css` Tailwind directives**

Change the first 3 lines (the `@tailwind` directives) to:

```css
@import "tailwindcss";
@import "tw-animate-css";
```

Keep everything below the `@tailwind` lines (scrollbar, rich text editor, etc.) untouched.

The full top of `src/index.css` should now be:
```css
@import "tailwindcss";
@import "tw-animate-css";

* {
  box-sizing: border-box;
}
/* ... rest of file unchanged ... */
```

- [ ] **Step 6: Delete old config files**

```bash
rm tailwind.config.ts postcss.config.js
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000` with no errors in terminal. The app should render (may look slightly different — fonts/colors — but no crash).

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts src/index.css package.json package-lock.json
git commit -m "feat: upgrade to Tailwind v4 with Vite plugin"
```

---

## Task 2: shadcn Init + Install All Components

**Files:**
- Create: `components.json`
- Create: `src/components/ui/button.tsx` (replaces existing)
- Create: `src/components/ui/input.tsx` (replaces existing)
- ... (all 18 shadcn components land in `src/components/ui/`)

- [ ] **Step 1: Run shadcn init**

```bash
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Slate** (we override with custom CSS vars in Task 3)
- CSS variables: **Yes**
- `components.json` path: accept default (`components.json`)
- `src/index.css` path: accept default (`src/index.css`)
- `tailwind.config.ts` path: since we deleted it, enter **no** or press enter to skip

This generates `components.json` and adds CSS variable scaffolding to `src/index.css`.

- [ ] **Step 2: Install all required shadcn components**

```bash
npx shadcn@latest add button input textarea select badge card dialog tabs dropdown-menu tooltip avatar skeleton separator label switch popover command calendar pagination sonner sheet
```

This generates all component files in `src/components/ui/`. Answer **yes** to overwrite if prompted.

- [ ] **Step 3: Verify the generated files exist**

```bash
ls src/components/ui/
```

Expected output includes: `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `badge.tsx`, `card.tsx`, `dialog.tsx`, `tabs.tsx`, `dropdown-menu.tsx`, `tooltip.tsx`, `avatar.tsx`, `skeleton.tsx`, `separator.tsx`, `label.tsx`, `switch.tsx`, `popover.tsx`, `command.tsx`, `calendar.tsx`, `pagination.tsx`, `sonner.tsx`, `sheet.tsx`

Note: This REPLACES our custom components. The app will have TypeScript errors until we finish all tasks.

- [ ] **Step 4: Verify dev server still starts (errors expected in browser)**

```bash
npm run dev
```

The Vite server should compile without a hard crash. TypeScript errors in consumer files are expected at this stage because the shadcn component APIs differ from our old custom APIs.

- [ ] **Step 5: Commit generated shadcn files**

```bash
git add components.json src/components/ui/ src/index.css package.json package-lock.json
git commit -m "feat: install shadcn/ui components"
```

---

## Task 3: Apply CSS Variable Theme

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the CSS variable block in `src/index.css`**

Find the `@layer base { :root { ... } .dark { ... } }` block that `shadcn init` added (it will have generic gray shades) and replace it entirely with:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --primary: 221 83% 53%;
    --primary-foreground: 0 0% 100%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 0 0% 100%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 221 83% 53%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222 47% 4%;
    --foreground: 210 40% 98%;
    --card: 222 47% 7%;
    --card-foreground: 210 40% 98%;
    --popover: 222 47% 7%;
    --popover-foreground: 210 40% 98%;
    --primary: 217 91% 60%;
    --primary-foreground: 0 0% 100%;
    --secondary: 217 33% 17%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217 33% 17%;
    --muted-foreground: 215 20% 65%;
    --accent: 217 33% 17%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 63% 31%;
    --destructive-foreground: 210 40% 98%;
    --border: 217 33% 17%;
    --input: 217 33% 17%;
    --ring: 217 91% 60%;
  }
}
```

Also add after the `@layer base` block (if not already present from shadcn init):

```css
@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 2: Verify the app renders with correct colors**

```bash
npm run dev
```

Open `http://localhost:3000`. The background should be white in light mode, very dark navy in dark mode (toggle via existing theme switcher).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: apply CSS variable theme system for shadcn"
```

---

## Task 4: Replace Badge, Skeleton, Separator, Card

The shadcn versions have identical or near-identical external APIs. We need to preserve the extra exports from our custom components (`StatusCategoryBadge`, `PriorityBadge`, `PageSkeleton`, `TableSkeleton`, `CardHeader`, `CardContent`, `CardFooter`).

**Files:**
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/skeleton.tsx`
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Update `src/components/ui/badge.tsx`**

The shadcn badge uses `cva` variants. Add our domain-specific exports below the shadcn-generated code. Replace the entire file with:

```typescript
import { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { IssueStatusCategory, IssuePriority } from '@/types'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-secondary text-secondary-foreground',
        primary: 'bg-primary/10 text-primary',
        success: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
        warning: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
        danger: 'bg-destructive/10 text-destructive',
        secondary: 'bg-secondary text-secondary-foreground',
        outline: 'border border-border text-foreground bg-background',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  )
}

export function StatusCategoryBadge({ category }: { category: IssueStatusCategory }) {
  const config = {
    [IssueStatusCategory.TODO]: { label: 'To Do', variant: 'default' as const },
    [IssueStatusCategory.IN_PROGRESS]: { label: 'In Progress', variant: 'primary' as const },
    [IssueStatusCategory.DONE]: { label: 'Done', variant: 'success' as const },
  }
  const { label, variant } = config[category] || config[IssueStatusCategory.TODO]
  return <Badge variant={variant}>{label}</Badge>
}

export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const config = {
    [IssuePriority.CRITICAL]: { label: 'Critical', variant: 'danger' as const },
    [IssuePriority.HIGH]: { label: 'High', variant: 'warning' as const },
    [IssuePriority.MEDIUM]: { label: 'Medium', variant: 'warning' as const },
    [IssuePriority.LOW]: { label: 'Low', variant: 'primary' as const },
    [IssuePriority.NONE]: { label: 'None', variant: 'default' as const },
  }
  const { label, variant } = config[priority] || config[IssuePriority.NONE]
  return <Badge variant={variant}>{label}</Badge>
}
```

- [ ] **Step 2: Update `src/components/ui/skeleton.tsx`**

Add our composite skeleton components below the shadcn Skeleton. Replace the entire file:

```typescript
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  )
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Update `src/components/ui/card.tsx`**

The shadcn card already has `Card`, `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription`. We just need to keep using the exact same CSS variable classes shadcn generates. The shadcn-generated file is fine — verify it exports all the names our codebase imports.

Open `src/components/ui/card.tsx` and verify these exports exist:
- `Card`
- `CardHeader`  
- `CardContent`
- `CardFooter`
- `CardTitle` (new — shadcn adds this)
- `CardDescription` (new — shadcn adds this)

If they all exist, no changes needed. The shadcn Card API is identical to ours.

- [ ] **Step 4: Verify TypeScript compiles for these components**

```bash
npx tsc --noEmit 2>&1 | grep -E "badge|skeleton|card" | head -20
```

Expected: zero errors for badge.tsx, skeleton.tsx, card.tsx.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx src/components/ui/skeleton.tsx src/components/ui/card.tsx
git commit -m "feat: replace Badge, Skeleton, Card with shadcn components"
```

---

## Task 5: Replace Avatar (keep wrapper API, use shadcn primitives)

We keep the same external props (`user`, `name`, `src`, `size`, `className`) so all 19 consumer files need zero changes. Internally we use shadcn `Avatar`/`AvatarImage`/`AvatarFallback`.

**Files:**
- Modify: `src/components/ui/avatar.tsx`

- [ ] **Step 1: Replace `src/components/ui/avatar.tsx`**

```typescript
import { cn, getInitials, generateAvatarColor } from '@/lib/utils'
import { User } from '@/types'
import {
  Avatar as AvatarPrimitive,
  AvatarImage,
  AvatarFallback,
} from '@radix-ui/react-avatar'

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg'

interface AvatarProps {
  user?: Partial<User> | null
  name?: string
  src?: string
  size?: AvatarSize
  className?: string
}

const sizes: Record<AvatarSize, string> = {
  xs: 'h-6 w-6 text-xs',
  sm: 'h-8 w-8 text-sm',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
}

export function Avatar({ user, name, src, size = 'md', className }: AvatarProps) {
  const displayName = name || user?.displayName || 'Unknown'
  const avatarSrc = src || user?.avatarUrl
  const initials = getInitials(displayName)
  const colorClass = generateAvatarColor(displayName)

  return (
    <AvatarPrimitive
      className={cn(
        'rounded-full flex-shrink-0 overflow-hidden',
        sizes[size],
        className,
      )}
    >
      <AvatarImage
        src={avatarSrc}
        alt={displayName}
        className="h-full w-full object-cover"
      />
      <AvatarFallback
        className={cn(
          'flex h-full w-full items-center justify-center rounded-full text-white font-medium',
          colorClass,
        )}
        title={displayName}
      >
        {initials}
      </AvatarFallback>
    </AvatarPrimitive>
  )
}

interface AvatarGroupProps {
  users: Partial<User>[]
  max?: number
  size?: AvatarSize
}

export function AvatarGroup({ users, max = 3, size = 'sm' }: AvatarGroupProps) {
  const visible = users.slice(0, max)
  const extra = users.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map((user, i) => (
        <Avatar
          key={user.id || i}
          user={user}
          size={size}
          className="ring-2 ring-white dark:ring-gray-900"
        />
      ))}
      {extra > 0 && (
        <div
          className={cn(
            'rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium ring-2 ring-white dark:ring-gray-900 text-xs',
            sizes[size],
          )}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}
```

Note: shadcn's `add avatar` command installs `@radix-ui/react-avatar`. The import above uses it directly. Alternatively, if shadcn generated an `avatar.tsx` that re-exports the primitives, import from `@/components/ui/avatar` shadcn primitives instead. Either way, the wrapper above is what consumers see.

- [ ] **Step 2: Verify no consumer file TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep "avatar" | head -20
```

Expected: zero errors related to avatar.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/avatar.tsx
git commit -m "feat: replace Avatar with shadcn/Radix primitive wrapper"
```

---

## Task 6: Replace Button (keep isLoading prop + size mappings)

53 consumer files use `<Button>`. We keep the same `isLoading`, `variant`, `size` API so zero consumer changes needed. Internally we use the shadcn CVA-based button.

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Replace `src/components/ui/button.tsx`**

```typescript
import { forwardRef, ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-base',
        'icon-sm': 'h-8 w-8 p-0 text-sm',
        default: 'h-9 px-4 text-sm',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'

export { buttonVariants }
```

- [ ] **Step 2: Verify TypeScript compiles for Button consumers**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep "button" | head -20
```

Expected: zero button-related errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat: replace Button with shadcn CVA button (keeps isLoading prop)"
```

---

## Task 7: Replace Tooltip (wrap TooltipProvider around app)

Only `src/components/layout/sidebar.tsx` imports Tooltip. shadcn Tooltip requires `<TooltipProvider>` as an ancestor. We keep the same `{ children, content, side }` API.

**Files:**
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Rewrite `src/components/ui/tooltip.tsx`**

```typescript
import { ReactNode } from 'react'
import {
  TooltipProvider,
  Tooltip as TooltipRoot,
  TooltipTrigger,
  TooltipContent,
} from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

interface TooltipProps {
  children: ReactNode
  content: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export function Tooltip({ children, content, side = 'top', className }: TooltipProps) {
  if (!content) return <>{children}</>

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent
          side={side}
          className={cn(
            'z-50 overflow-hidden rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
            className,
          )}
        >
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}
```

Note: We embed `TooltipProvider` inside the component itself — simpler for a one-file replacement, no need to wrap main.tsx.

- [ ] **Step 2: Verify sidebar.tsx compiles**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep "tooltip\|sidebar" | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/tooltip.tsx
git commit -m "feat: replace Tooltip with Radix UI tooltip primitive"
```

---

## Task 8: Replace Input, Textarea, Label (keep label/error/helperText props)

The shadcn `Input` and `Textarea` are bare primitives. We keep the convenience wrapper API (`label`, `error`, `helperText`) so all ~30 consumer files need zero changes. We use the shadcn `Label` component internally.

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`

The shadcn `label.tsx` is kept as-is (it's a thin Radix Label wrapper, which is what we now use internally).

- [ ] **Step 1: Replace `src/components/ui/input.tsx`**

```typescript
import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={inputId} className="mb-1">
            {label}
          </Label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {helperText && !error && <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
```

- [ ] **Step 2: Replace `src/components/ui/textarea.tsx`**

```typescript
import { forwardRef, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Label } from './label'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="w-full">
        {label && (
          <Label htmlFor={inputId} className="mb-1">
            {label}
          </Label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={cn(
            'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm',
            'placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'resize-y',
            error && 'border-destructive focus-visible:ring-destructive',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        {helperText && !error && <p className="mt-1 text-sm text-muted-foreground">{helperText}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
```

- [ ] **Step 3: Verify consumer files compile**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "input|textarea" | head -20
```

Expected: zero errors for input.tsx, textarea.tsx.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx
git commit -m "feat: replace Input and Textarea with shadcn primitives (keep convenience props)"
```

---

## Task 9: Replace Select — update 16 consumer files

This is the largest API change. Our old `Select` took `options={[]}` array. shadcn `Select` uses compound components. We rewrite `select.tsx` to export shadcn's compound API, then update all 16 consumer files.

**Files to update (16 total):**
1. `src/pages/ProjectSettingsPage.tsx`
2. `src/pages/ProjectReportsPage.tsx`
3. `src/pages/ProjectBacklogPage.tsx`
4. `src/pages/ProjectTimelinePage.tsx`
5. `src/pages/ProjectCalendarPage.tsx`
6. `src/pages/ProjectIssuesPage.tsx`
7. `src/pages/ProjectBoardPage.tsx`
8. `src/pages/UserSettingsPage.tsx`
9. `src/pages/MyIssuesPage.tsx`
10. `src/components/projects/custom-field-settings.tsx`
11. `src/components/issues/issue-form.tsx`
12. `src/components/issues/custom-fields-form.tsx`
13. `src/components/issues/bulk-move-dialog.tsx`
14. `src/components/automation/trigger-select.tsx`
15. `src/components/automation/condition-builder.tsx`
16. `src/components/automation/action-builder.tsx`

- [ ] **Step 1: Verify what shadcn generated for `src/components/ui/select.tsx`**

```bash
head -20 src/components/ui/select.tsx
```

The shadcn-generated `select.tsx` already exports:
`Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`

No changes needed to `select.tsx` itself — it's already the shadcn version from Task 2.

- [ ] **Step 2: Update all 16 consumer files**

The transformation pattern for every file is:

**BEFORE:**
```tsx
import { Select } from '@/components/ui/select'
// ...
<Select
  label="Sprint"
  options={SPRINT_OPTIONS}
  value={sprintId}
  onChange={(e) => setSprintId(e.target.value)}
/>
```

**AFTER:**
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
// ...
<div className="w-full">
  <Label className="mb-1">Sprint</Label>
  <Select value={sprintId} onValueChange={setSprintId}>
    <SelectTrigger>
      <SelectValue placeholder="Select sprint" />
    </SelectTrigger>
    <SelectContent>
      {SPRINT_OPTIONS.map((opt) => (
        <SelectItem key={opt.value} value={opt.value}>
          {opt.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Key differences:
- `options={[]}` → `<SelectItem>` children inside `<SelectContent>`
- `onChange={(e) => setValue(e.target.value)}` → `onValueChange={setValue}`
- `label=""` prop → separate `<Label>` element above `<Select>`
- If the Select had no label, omit the Label wrapper
- `placeholder=""` moves to `<SelectValue placeholder="..." />`
- `error=""` → `<p className="mt-1 text-sm text-destructive">{error}</p>` after the closing `</Select>`

Apply this transformation to every occurrence of `<Select options={` in all 16 files listed above.

- [ ] **Step 3: Verify TypeScript compiles cleanly for all 16 files**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "select|Select" | head -30
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ src/components/projects/ src/components/issues/ src/components/automation/ src/components/ui/select.tsx
git commit -m "feat: replace custom Select with shadcn compound Select (16 consumer files)"
```

---

## Task 10: Replace Dialog — update 20 consumer files

The API change is: `onClose` → `onOpenChange`. shadcn `Dialog` also provides `DialogClose` for the X button. We keep the same subcomponent names (`DialogHeader`, `DialogTitle`, `DialogContent`, `DialogFooter`).

**Consumer files (20 total):**
1. `src/pages/ProjectSettingsPage.tsx`
2. `src/pages/ProjectAutomationsPage.tsx`
3. `src/pages/ProjectBacklogPage.tsx`
4. `src/pages/ProjectCalendarPage.tsx`
5. `src/pages/ProjectIssuesPage.tsx`
6. `src/pages/ProjectReleasesPage.tsx`
7. `src/pages/ProjectBoardPage.tsx`
8. `src/pages/WebhooksPage.tsx`
9. `src/pages/TeamPage.tsx`
10. `src/pages/RoleManagementPage.tsx`
11. `src/pages/ProjectsPage.tsx`
12. `src/pages/IssueDetailPage.tsx`
13. `src/components/projects/version-list.tsx`
14. `src/components/projects/custom-field-settings.tsx`
15. `src/components/projects/component-list.tsx`
16. `src/components/issues/issue-links-list.tsx`
17. `src/components/issues/bulk-status-dialog.tsx`
18. `src/components/issues/bulk-move-dialog.tsx`
19. `src/components/issues/bulk-assign-dialog.tsx`
20. `src/components/common/confirm-dialog.tsx`

- [ ] **Step 1: Check the shadcn-generated `src/components/ui/dialog.tsx` exports**

```bash
grep "^export" src/components/ui/dialog.tsx
```

Expected exports from shadcn: `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogClose`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`

Note: shadcn's `DialogContent` already includes the overlay and close button (X) built-in. Our old `Dialog` wrapper component is no longer needed.

- [ ] **Step 2: Update `src/components/common/confirm-dialog.tsx` (representative example)**

Look at its current content and apply this transformation:

**BEFORE (old API):**
```tsx
import { Dialog, DialogHeader, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'

<Dialog open={open} onClose={onCancel}>
  <DialogHeader onClose={onCancel}>
    <DialogTitle>{title}</DialogTitle>
  </DialogHeader>
  <DialogContent>
    <p>{message}</p>
  </DialogContent>
  <DialogFooter>
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
    <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
  </DialogFooter>
</Dialog>
```

**AFTER (shadcn API):**
```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

<Dialog open={open} onOpenChange={(open) => !open && onCancel()}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{message}</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button variant="destructive" onClick={onConfirm}>Confirm</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Key changes:
- `<Dialog open={open} onClose={fn}>` → `<Dialog open={open} onOpenChange={(open) => !open && fn()}>`
- `<DialogHeader onClose={fn}>` — remove `onClose` prop (shadcn's `DialogContent` has a built-in X button)
- `<DialogContent>` from our old component wrapping body → the shadcn `DialogContent` wraps everything
- `<DialogContent className="...">` from our code (body padding) → use `<div className="px-0 py-4">` inside shadcn's DialogContent

- [ ] **Step 3: Apply the same transformation to the remaining 19 consumer files**

Pattern for every file:
1. Change `onClose={fn}` on `<Dialog>` → `onOpenChange={(open) => !open && fn()}`
2. Remove `onClose` prop from `<DialogHeader>`
3. Move `<Dialog className={...}>` sizing class → `<DialogContent className={...}>` instead
4. Wrap dialog body content in shadcn's `<DialogContent>` which is the outer container

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -i "dialog" | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ src/components/ src/components/ui/dialog.tsx
git commit -m "feat: replace custom Dialog with shadcn Dialog (20 consumer files)"
```

---

## Task 11: Replace DropdownMenu — update 6 consumer files

Old API: `<DropdownMenu trigger={<Button />}>`. shadcn API: `<DropdownMenu><DropdownMenuTrigger asChild><Button /></DropdownMenuTrigger><DropdownMenuContent>`.

Also: `<DropdownItem>` → `<DropdownMenuItem>`, `<DropdownSeparator>` → `<DropdownMenuSeparator>`, `<DropdownLabel>` → `<DropdownMenuLabel>`.

**Consumer files (6):**
1. `src/pages/ProjectIssuesPage.tsx`
2. `src/pages/TeamPage.tsx`
3. `src/pages/PageDetailPage.tsx`
4. `src/components/pages/page-tree.tsx`
5. `src/components/layout/topbar.tsx`
6. `src/components/board/board-column.tsx`

- [ ] **Step 1: Check shadcn-generated `src/components/ui/dropdown-menu.tsx` exports**

```bash
grep "^export" src/components/ui/dropdown-menu.tsx
```

Expected: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuRadioItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuGroup`, `DropdownMenuPortal`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuRadioGroup`

- [ ] **Step 2: Update `src/components/layout/topbar.tsx` (representative)**

**BEFORE:**
```tsx
import { DropdownMenu, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown-menu'

<DropdownMenu trigger={<button>...</button>}>
  <DropdownItem onClick={handleLogout}>Logout</DropdownItem>
  <DropdownSeparator />
  <DropdownItem destructive onClick={handleDelete}>Delete</DropdownItem>
</DropdownMenu>
```

**AFTER:**
```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <button>...</button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={handleLogout}>Logout</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      className="text-destructive focus:text-destructive"
      onClick={handleDelete}
    >
      Delete
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Key changes:
- `trigger={...}` prop removed → `<DropdownMenuTrigger asChild>` wraps the trigger element
- `align="right"` → `align="end"` on `DropdownMenuContent`
- `DropdownItem` → `DropdownMenuItem`
- `DropdownSeparator` → `DropdownMenuSeparator`
- `DropdownLabel` → `DropdownMenuLabel`
- `destructive` prop on item → `className="text-destructive focus:text-destructive"`
- `disabled` prop → keep as-is (shadcn DropdownMenuItem supports `disabled`)

- [ ] **Step 3: Apply to remaining 5 consumer files**

Apply the same `trigger` prop → `DropdownMenuTrigger asChild` transformation.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -i "dropdown" | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ src/components/
git commit -m "feat: replace custom DropdownMenu with shadcn DropdownMenu (6 consumer files)"
```

---

## Task 12: Replace Tabs — update 1 consumer file

Only `src/pages/TimesheetPage.tsx` imports from `@/components/ui/tabs`.

**Files:**
- Modify: `src/pages/TimesheetPage.tsx`

- [ ] **Step 1: Check how tabs are used in TimesheetPage.tsx**

Read the relevant section of the file to understand the current `tabs={[]}` + `activeTab` + `onChange` usage.

- [ ] **Step 2: Update TimesheetPage.tsx**

**BEFORE:**
```tsx
import { Tabs, TabContent } from '@/components/ui/tabs'

const TABS = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
]

<Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

{activeTab === 'week' && <TabContent>...</TabContent>}
{activeTab === 'month' && <TabContent>...</TabContent>}
```

**AFTER:**
```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="week">This Week</TabsTrigger>
    <TabsTrigger value="month">This Month</TabsTrigger>
  </TabsList>
  <TabsContent value="week">...</TabsContent>
  <TabsContent value="month">...</TabsContent>
</Tabs>
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -i "tabs\|timesheet" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/TimesheetPage.tsx
git commit -m "feat: replace Tabs with shadcn Tabs in TimesheetPage"
```

---

## Task 13: Migrate Toast → Sonner

Replace the Zustand toast system with Sonner. All 23 hooks use `toast()` from `@/store/ui.store` — we re-export Sonner's `toast` from the same path so hooks need zero changes. We remove `toasts[]`, `addToast`, `removeToast` from the store.

**Files:**
- Modify: `src/store/ui.store.ts`
- Modify: `src/components/layout/AppLayout.tsx`
- Delete: `src/components/ui/toast.tsx`
- Modify: `src/components/layout/topbar.tsx` (uses `useUiStore` — verify it doesn't call addToast)
- Modify: `src/components/layout/sidebar.tsx` (same check)
- Modify: `src/components/layout/search-modal.tsx` (same check)
- Modify: `src/components/layout/org-switcher.tsx` (same check)
- Modify: `src/components/layout/command-palette.tsx` (same check)

- [ ] **Step 1: Update `src/store/ui.store.ts`**

Remove the `Toast` interface, `toasts[]`, `addToast`, `removeToast` from the store. Re-export Sonner's `toast` so all existing `import { toast } from '@/store/ui.store'` imports keep working without changes:

```typescript
import { create } from 'zustand'
export { toast } from 'sonner'

interface UiState {
  isSidebarOpen: boolean
  isSearchOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  isSidebarOpen: true,
  isSearchOpen: false,
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setSearchOpen: (open) => set({ isSearchOpen: open }),
}))
```

- [ ] **Step 2: Update `src/components/layout/AppLayout.tsx`**

Remove `ToastContainer` import and usage. Add `Toaster` from sonner:

```typescript
import { Toaster } from '@/components/ui/sonner'  // shadcn sonner wrapper

// In the JSX, replace <ToastContainer /> with:
<Toaster position="bottom-right" richColors />
```

Full updated AppLayout.tsx imports section (remove toast import, add Toaster):
```typescript
// Remove: import { ToastContainer } from '@/components/ui/toast'
// Add:
import { Toaster } from '@/components/ui/sonner'
```

- [ ] **Step 3: Check the 7 layout files that import from ui.store for direct addToast calls**

```bash
grep -n "addToast\|toasts\|removeToast" \
  src/components/layout/topbar.tsx \
  src/components/layout/sidebar.tsx \
  src/components/layout/search-modal.tsx \
  src/components/layout/org-switcher.tsx \
  src/components/layout/command-palette.tsx \
  src/pages/ProjectBoardPage.tsx \
  src/pages/auth/AcceptInvitePage.tsx \
  src/pages/UserSettingsPage.tsx \
  src/pages/BillingPage.tsx
```

For any file that calls `addToast({ type: 'success', message: '...' })` directly (not via the `toast()` wrapper), replace with `toast.success('...')` or `toast.error('...')` from sonner.

If a file only uses `useUiStore` for `isSidebarOpen`, `isSearchOpen`, etc. — no changes needed.

- [ ] **Step 4: Delete old toast component**

```bash
rm src/components/ui/toast.tsx
```

- [ ] **Step 5: Verify full TypeScript compile**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -i "toast" | head -20
```

Expected: zero toast-related errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/ui.store.ts src/components/layout/AppLayout.tsx src/components/layout/
git rm src/components/ui/toast.tsx
git commit -m "feat: replace Zustand toast store with Sonner (zero hook changes needed)"
```

---

## Task 14: Rebuild DatePicker with shadcn Popover + Calendar

Keep the same external API (`value`, `onChange`, `placeholder`, `label`, `disabled`, `className`). Rebuild the internals using shadcn's `Popover` and `Calendar` (react-day-picker v8) — eliminating the hand-rolled calendar grid.

**Files:**
- Modify: `src/components/ui/date-picker.tsx`

Note: `react-day-picker` v8 is installed as a peer dep when you ran `npx shadcn@latest add calendar`. The shadcn `Calendar` component in `src/components/ui/calendar.tsx` wraps it.

- [ ] **Step 1: Replace `src/components/ui/date-picker.tsx`**

Replace the entire file with a Popover + shadcn Calendar rebuild:

```typescript
import { useId } from 'react'
import { format, parseISO } from 'date-fns'
import { CalendarDays, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Label } from './label'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Calendar } from './calendar'

interface DatePickerProps {
  value?: string
  onChange: (date: string | undefined) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  label,
  disabled,
  className,
}: DatePickerProps) {
  const generatedId = useId()
  const inputId = label ? `datepicker-${generatedId}` : undefined
  const selectedDate = value ? parseISO(value) : undefined

  const handleSelect = (day: Date | undefined) => {
    onChange(day ? format(day, 'yyyy-MM-dd') : undefined)
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <Label htmlFor={inputId} className="mb-1">
          {label}
        </Label>
      )}
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <button
              id={inputId}
              type="button"
              disabled={disabled}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left pr-8',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                !value ? 'text-muted-foreground' : 'text-foreground',
              )}
            >
              <CalendarDays className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">
                {selectedDate ? format(selectedDate, 'MMM d, yyyy') : placeholder}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {value && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => onChange(undefined)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/date-picker.tsx
git commit -m "feat: rebuild DatePicker with CSS variable tokens"
```

---

## Task 15: Update Pagination with CSS Variable Classes

Same API (`page`, `totalPages`, `total`, `limit`, `onPageChange`). Replace `dark:` classes with CSS variable tokens.

**Files:**
- Modify: `src/components/ui/pagination/index.tsx`

- [ ] **Step 1: Replace the CSS classes in `src/components/ui/pagination/index.tsx`**

The logic stays identical. Apply these class replacements throughout the file:

| Old class(es) | New class |
|---|---|
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-700 dark:text-gray-300` | `text-foreground` |
| `hover:bg-gray-100 dark:hover:bg-gray-800` | `hover:bg-accent` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `bg-blue-600 text-white hover:bg-blue-700` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| `focus:ring-blue-500 focus:ring-offset-1 dark:focus:ring-offset-gray-900` | `focus-visible:ring-ring focus-visible:ring-offset-1` |
| `text-gray-600 dark:text-gray-300` | `text-foreground` |
| `text-gray-400 dark:text-gray-500` | `text-muted-foreground` |

- [ ] **Step 2: Commit**

```bash
git add src/components/ui/pagination/index.tsx
git commit -m "feat: update Pagination with CSS variable tokens"
```

---

## Task 15b: Rebuild UserSelect Combobox with shadcn Command + Popover

The `user-select.tsx` is a hand-rolled combobox with search + AI suggestions. Rebuild it using shadcn `Command` + `Popover` — same external API, Radix accessibility primitives under the hood.

**Files:**
- Modify: `src/components/common/user-select.tsx`

External API stays identical:
```typescript
interface UserSelectProps {
  value: string | null
  onChange: (userId: string | null) => void
  placeholder?: string
  className?: string
  projectId?: string
  issueType?: string
}
```

- [ ] **Step 1: Rewrite `src/components/common/user-select.tsx`**

```typescript
import { useState } from 'react'
import { Check, ChevronsUpDown, Sparkles, X } from 'lucide-react'
import { useUsersDropdown, DropdownUser } from '@/hooks/useUsers'
import { useProjectMembers } from '@/hooks/useProjects'
import { useAiAssignees, useAiStatus, AssigneeSuggestion } from '@/hooks/useAi'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

interface UserSelectProps {
  value: string | null
  onChange: (userId: string | null) => void
  placeholder?: string
  className?: string
  projectId?: string
  issueType?: string
}

export function UserSelect({
  value,
  onChange,
  placeholder = 'Select user',
  className,
  projectId,
  issueType,
}: UserSelectProps) {
  const [open, setOpen] = useState(false)

  const { data: allUsers = [] } = useUsersDropdown()
  const { data: projectMembers } = useProjectMembers(projectId || '')

  const users: DropdownUser[] = projectId && projectMembers
    ? projectMembers.map((m) => ({
        id: m.user.id,
        email: m.user.email,
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl,
      }))
    : allUsers

  const { data: aiStatus } = useAiStatus()
  const { data: aiSuggestions = [] } = useAiAssignees(projectId, issueType)
  const selectedUser = users.find((u) => u.id === value) ?? null

  const isSyntheticEmail = (email: string) => email.endsWith('@migrated.jira.local')

  const handleSelect = (userId: string | null) => {
    onChange(userId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-left',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          {selectedUser ? (
            <>
              <Avatar user={selectedUser} size="xs" />
              <span className="flex-1 text-foreground truncate">{selectedUser.displayName}</span>
              <span
                role="button"
                aria-label="Clear selection"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            </>
          ) : (
            <>
              <span className="flex-1 text-muted-foreground">{placeholder}</span>
              <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>

            {/* AI Suggested Assignees */}
            {aiStatus?.enabled && aiSuggestions.length > 0 && (
              <>
                <CommandGroup heading={
                  <span className="flex items-center gap-1.5 text-purple-500">
                    <Sparkles className="h-3 w-3" />
                    AI Suggested
                  </span>
                }>
                  {aiSuggestions.map((s: AssigneeSuggestion) => {
                    const user = users.find((u) => u.id === s.userId)
                    return (
                      <CommandItem
                        key={`ai-${s.userId}`}
                        value={`ai-${s.userId}-${s.displayName}`}
                        onSelect={() => handleSelect(s.userId)}
                        className="hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      >
                        <Avatar
                          user={user || { displayName: s.displayName, avatarUrl: s.avatarUrl }}
                          size="xs"
                        />
                        <div className="flex-1 min-w-0 ml-2">
                          <p className="font-medium truncate">{s.displayName}</p>
                          <p className="text-purple-500 text-[10px] truncate">{s.reason}</p>
                        </div>
                        {value === s.userId && <Check className="h-4 w-4 ml-auto" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            <CommandGroup>
              <CommandItem
                value="__unassigned__"
                onSelect={() => handleSelect(null)}
              >
                <span className="text-muted-foreground">Unassigned</span>
                {value === null && <Check className="h-4 w-4 ml-auto" />}
              </CommandItem>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.displayName} ${user.email}`}
                  onSelect={() => handleSelect(user.id)}
                >
                  <Avatar user={user} size="xs" />
                  <div className="flex-1 min-w-0 ml-2">
                    <p className="font-medium truncate">{user.displayName}</p>
                    {isSyntheticEmail(user.email) ? (
                      <p className="text-amber-500 text-xs truncate">Migrated (no email)</p>
                    ) : (
                      <p className="text-muted-foreground text-xs truncate">{user.email}</p>
                    )}
                  </div>
                  {value === user.id && <Check className="h-4 w-4 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -i "user-select\|UserSelect" | head -10
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/common/user-select.tsx
git commit -m "feat: rebuild UserSelect combobox with shadcn Command + Popover"
```

---

## Task 16: Dark Mode Audit — Replace hardcoded dark: classes in all pages

Remove raw `dark:bg-gray-*`, `dark:text-gray-*`, `dark:border-gray-*` classes from all page and component files. Replace with CSS variable-based tokens.

**Conversion table:**

| Old | New |
|---|---|
| `bg-white dark:bg-gray-900` | `bg-card` |
| `bg-white dark:bg-gray-800` | `bg-card` |
| `bg-gray-50 dark:bg-gray-950` | `bg-background` |
| `bg-gray-50 dark:bg-gray-800` | `bg-muted` |
| `bg-gray-100 dark:bg-gray-800` | `bg-muted` |
| `text-gray-900 dark:text-gray-100` | `text-foreground` |
| `text-gray-700 dark:text-gray-300` | `text-foreground` |
| `text-gray-500 dark:text-gray-400` | `text-muted-foreground` |
| `text-gray-400 dark:text-gray-500` | `text-muted-foreground` |
| `border-gray-200 dark:border-gray-700` | `border-border` |
| `border-gray-300 dark:border-gray-600` | `border-border` |
| `hover:bg-gray-100 dark:hover:bg-gray-800` | `hover:bg-accent` |
| `hover:bg-gray-50 dark:hover:bg-gray-900` | `hover:bg-accent` |

**Files to audit (key pages — all files under `src/pages/` and `src/components/layout/`):**

- [ ] **Step 1: Audit `src/components/layout/` (sidebar.tsx, topbar.tsx, AppLayout.tsx)**

For each file, replace the `dark:` color pairs listed above with their CSS variable equivalents.

- [ ] **Step 2: Audit all project pages**

Files: `ProjectBoardPage.tsx`, `ProjectBacklogPage.tsx`, `ProjectIssuesPage.tsx`, `ProjectCalendarPage.tsx`, `ProjectTimelinePage.tsx`, `ProjectReportsPage.tsx`, `ProjectSettingsPage.tsx`, `ProjectPagesPage.tsx`, `ProjectAutomationsPage.tsx`, `ProjectTrashPage.tsx`, `ProjectReleasesPage.tsx`

Apply the same replacements in each file.

- [ ] **Step 3: Audit remaining pages**

Files: `IssueDetailPage.tsx`, `DashboardPage.tsx`, `TeamPage.tsx`, `UserSettingsPage.tsx`, `NotificationsPage.tsx`, `AuditLogPage.tsx`, `BillingPage.tsx`, `TimesheetPage.tsx`, `WebhooksPage.tsx`, `RoleManagementPage.tsx`, `ProjectsPage.tsx`, `MyIssuesPage.tsx`, `ImportPage.tsx`, `PageDetailPage.tsx`

- [ ] **Step 4: Audit key components**

Files: `src/components/issues/`, `src/components/board/`, `src/components/common/`

Focus on the most visually prominent components: `issue-card.tsx`, `board-card.tsx`, `board-column.tsx`, `issue-form.tsx`, `issue-table-row.tsx`, `confirm-dialog.tsx`

- [ ] **Step 5: Verify tsc passes completely**

```bash
npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -50
```

Expected: zero errors.

- [ ] **Step 6: Run a build to confirm no tree-shaking issues**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "feat: replace hardcoded dark: classes with CSS variable tokens across all pages"
```

---

## Final Verification Checklist

After all 16 tasks are complete, verify against the spec's success criteria:

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npm run build` succeeds
- [ ] Light mode renders correctly on all 8 project pages
- [ ] Dark mode renders correctly on all 8 project pages (toggle theme)
- [ ] Select dropdowns open/close with keyboard navigation (Radix UI)
- [ ] Dialogs trap focus correctly (Radix UI)
- [ ] Dropdown menus close on outside click (Radix UI)
- [ ] Sonner toast appears when creating/updating an issue
- [ ] DatePicker opens, selects a date, clears correctly
- [ ] Pagination renders with correct page numbers
- [ ] No raw `dark:bg-gray-` or `dark:text-gray-` classes remain in page files: `grep -r "dark:bg-gray\|dark:text-gray" src/pages/ src/components/layout/`
