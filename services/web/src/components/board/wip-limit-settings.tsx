import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface WipLimitSettingsProps {
  currentLimit: number
  onSave: (limit: number) => void
  onClose: () => void
}

export function WipLimitSettings({ currentLimit, onSave, onClose }: WipLimitSettingsProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState(currentLimit.toString())

  const handleSave = () => {
    const num = parseInt(value, 10)
    onSave(isNaN(num) || num < 0 ? 0 : num)
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="relative z-20 mb-2 bg-card border border-border rounded-lg shadow-lg dark:shadow-black/40 p-3">
        <div className="text-xs font-semibold text-foreground mb-2">
          {t('board.wipLimit', 'WIP Limit')}
        </div>
        <p className="text-xs text-gray-500 mb-2">
          {t('board.wipLimitDesc', 'Set to 0 for no limit. Issues beyond the limit will trigger a warning.')}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') onClose()
            }}
            className="w-20 px-2 py-1.5 text-sm border border-border bg-card text-foreground rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus:border-transparent"
            autoFocus
          />
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {t('common.save', 'Save')}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-border rounded-md hover:bg-accent transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </>
  )
}
