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
      <div className="relative z-20 mb-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 p-3">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
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
            className="w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            {t('common.save', 'Save')}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </>
  )
}
