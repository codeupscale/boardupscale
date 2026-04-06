import { useEffect, useRef } from 'react'

/**
 * Attaches an IntersectionObserver to a sentinel element placed at the bottom
 * of a scrollable container. Calls onLoadMore when the sentinel enters view.
 *
 * @param hasMore   - Whether there are more items to load
 * @param isLoading - Whether a load is already in flight (prevents duplicate calls)
 * @param onLoadMore - Callback to fetch the next page
 * @param rootRef   - Ref to the scroll container (used as IntersectionObserver root)
 *                    Pass the ref to the scrollable div so rootMargin applies to
 *                    the container bounds rather than the viewport.
 * @param rootMargin - How far from the container bottom to trigger (default "200px")
 */
export function useScrollPagination(
  hasMore: boolean,
  isLoading: boolean,
  onLoadMore: () => void,
  rootRef: React.RefObject<HTMLElement | null>,
  rootMargin = '0px 0px 200px 0px',
): React.RefObject<HTMLDivElement> {
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Use refs for callback and isLoading so the observer is never re-created
  // due to those values changing — prevents observer churn.
  const onLoadMoreRef = useRef(onLoadMore)
  onLoadMoreRef.current = onLoadMore
  const isLoadingRef = useRef(isLoading)
  isLoadingRef.current = isLoading

  useEffect(() => {
    // No more pages → nothing to observe
    if (!hasMore) return

    const sentinel = sentinelRef.current
    if (!sentinel) return

    const root = rootRef.current ?? null

    const observer = new IntersectionObserver(
      (entries) => {
        // Guard against duplicate in-flight requests
        if (entries[0].isIntersecting && !isLoadingRef.current) {
          onLoadMoreRef.current()
        }
      },
      { root, rootMargin, threshold: 0 },
    )

    observer.observe(sentinel)

    // Always disconnect on cleanup — no memory leak
    return () => {
      observer.disconnect()
    }
    // rootRef.current is intentionally read once at effect time (stable DOM ref).
    // rootMargin is a string constant. hasMore controls when to observe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, rootMargin])

  return sentinelRef
}
