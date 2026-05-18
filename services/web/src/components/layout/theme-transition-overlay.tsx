import { useEffect, useState } from 'react'
import { useThemeStore } from '@/store/theme.store'
import { Spinner } from '@/components/ui/spinner'
import { Logo } from '@/components/Logo'

/**
 * Full-viewport loading screen shown while the theme store reports
 * `changing: true`.
 *
 * Why this exists
 * ───────────────
 * The legacy `theme-transition` CSS rule animates only `background-color`,
 * `border-color`, and `color`. Everything else (SVG fills, box-shadows,
 * gradients, focus rings, etc.) snaps instantly, which produced the
 * "component-by-component" stagger users saw when toggling light/dark.
 *
 * Rather than rewriting every transition rule, we cover the brief
 * staggered window with an opaque, branded loading screen. By the time
 * the screen fades out, all transitions have settled and the user sees
 * the new theme fully applied — no flicker, no stagger.
 *
 * Implementation notes
 * ────────────────────
 * - Opaque (`bg-zinc-950`), theme-agnostic so the overlay itself doesn't
 *   shift colour during the swap.
 * - Brand mark + spinner + text gives the brief window a deliberate,
 *   loading-screen feel rather than a confused flash.
 * - Mounted once at the app root. z-[10000] sits above every Radix
 *   portal (which top out around z-9999 in this codebase).
 * - pointer-events-none on the inner card so accidental clicks during
 *   the ~600 ms window are never swallowed.
 * - `motion-safe:` prefix on the fade animation honours the user's
 *   prefers-reduced-motion preference.
 */
export function ThemeTransitionOverlay() {
  const changing = useThemeStore((s) => s.changing)

  // `mounted` keeps the node alive through the fade-out animation
  // after `changing` flips back to false.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (changing) {
      setMounted(true)
      return
    }
    // Match the fade-out duration below (250 ms).
    const t = setTimeout(() => setMounted(false), 250)
    return () => clearTimeout(t)
  }, [changing])

  if (!mounted) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Applying theme"
      // Opaque cover. The overlay's own colour is fixed to zinc-950 so it
      // doesn't itself theme-shift during the swap it's trying to hide.
      // Pointer-events-none — overlay is strictly visual.
      className={
        'fixed inset-0 z-[10000] flex flex-col items-center justify-center gap-6 ' +
        'bg-zinc-950 pointer-events-none ' +
        'motion-safe:transition-opacity motion-safe:duration-250 ' +
        (changing ? 'opacity-100' : 'opacity-0')
      }
    >
      {/* Brand mark.
          The Logo's "Board" text uses `text-foreground` which is dark in
          light mode and light in dark mode. The overlay's bg is always
          zinc-950, so we force all span descendants to white here so the
          brand reads cleanly regardless of which theme we're transitioning
          from / to. The "upscale" gradient is background-clipped and
          unaffected by the color override. */}
      <div className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 [&_span]:!text-white">
        <Logo size="lg" variant="full" />
      </div>

      {/* Spinner — slightly larger than the inline one to feel like an
          intentional loading state, not a momentary indicator. */}
      <Spinner className="h-7 w-7 text-white/80" />

      <p className="text-xs font-medium text-white/60 tracking-wide uppercase">
        Applying theme&hellip;
      </p>
    </div>
  )
}
