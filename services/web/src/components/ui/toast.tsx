import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { cn } from '@/lib/utils'

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full" role="alert" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full',
            toast.type === 'success' && 'bg-white dark:bg-gray-900 border-green-200 dark:border-green-800',
            toast.type === 'error' && 'bg-white dark:bg-gray-900 border-red-200 dark:border-red-800',
            toast.type === 'info' && 'bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800',
          )}
        >
          {toast.type === 'success' && (
            <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
          )}
          {toast.type === 'error' && (
            <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          {toast.type === 'info' && (
            <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          )}
          <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
