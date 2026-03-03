import { CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useUiStore } from '@/store/ui.store'
import { cn } from '@/lib/utils'

export function ToastContainer() {
  const { toasts, removeToast } = useUiStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border animate-in slide-in-from-right-full',
            toast.type === 'success' && 'bg-white border-green-200',
            toast.type === 'error' && 'bg-white border-red-200',
            toast.type === 'info' && 'bg-white border-blue-200',
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
          <p className="text-sm text-gray-800 flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
