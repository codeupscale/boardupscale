import { cn } from '@/lib/utils'

/** Centralized styling tokens for ticket create/edit modals */
export const ticketModalTokens = {
  overlay: cn(
    'fixed inset-0 z-50 bg-black/60 backdrop-blur-md',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
  ),
  content: cn(
    'fixed left-1/2 top-1/2 z-50 flex flex-col w-full max-w-4xl max-h-[90vh]',
    '-translate-x-1/2 -translate-y-1/2',
    'rounded-xl border-2 border-violet-500/70 bg-card',
    'shadow-2xl shadow-violet-500/15 ring-1 ring-violet-400/25',
    'duration-200',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
    'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
    'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
  ),
  closeButton: cn(
    'absolute right-5 top-5 rounded-md p-1',
    'text-muted-foreground opacity-70 transition-opacity',
    'hover:opacity-100 hover:text-foreground',
    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    'disabled:pointer-events-none',
  ),
  header: 'flex-shrink-0 px-6 pt-6 pb-4 border-b border-border/60',
  headerTitle: 'text-xl font-semibold text-foreground tracking-tight',
  headerSubtitle: 'text-sm text-muted-foreground mt-1',
  headerBadge: cn(
    'inline-flex items-center rounded-md px-2 py-0.5 ml-2',
    'text-xs font-mono font-medium text-muted-foreground',
    'bg-muted border border-border',
  ),
  body: 'flex-1 overflow-y-auto px-6 py-5 min-h-0',
  footer: cn(
    'flex-shrink-0 flex items-center justify-end gap-3',
    'px-6 py-4 border-t border-border/60 bg-card/80',
  ),
  fieldLabel: cn(
    'block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5',
  ),
  fieldError: 'mt-1 text-sm text-destructive',
  formRow: 'grid grid-cols-1 sm:grid-cols-2 gap-4',
  formSection: 'space-y-4',
  formGap: 'space-y-5',
  /** Field control surface — matches IssueTypeSelect (`bg-card`) */
  fieldSurface: cn(
    'rounded-lg border border-input bg-card text-foreground',
    'transition-colors hover:border-border',
  ),
  fieldFocus:
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  fieldDisabled: 'disabled:cursor-not-allowed disabled:opacity-50',
  fieldHeight: 'h-10',
} as const
