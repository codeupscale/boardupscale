import { useState, useEffect } from 'react'
import { CustomFieldDefinition, CustomFieldValue, CustomFieldType } from '@/types'
import { Input } from '@/components/ui/input'
import { UserSelect } from '@/components/common/user-select'
import { Button } from '@/components/ui/button'

interface CustomFieldsFormProps {
  definitions: CustomFieldDefinition[]
  values: CustomFieldValue[]
  onChange: (fieldId: string, value: any) => void
  readOnly?: boolean
}

function CustomFieldInput({
  definition,
  value,
  onChange,
  readOnly,
}: {
  definition: CustomFieldDefinition
  value: any
  onChange: (value: any) => void
  readOnly?: boolean
}) {
  switch (definition.fieldType) {
    case 'text':
      return (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={definition.description || `Enter ${definition.name}...`}
          disabled={readOnly}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={value ?? ''}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : null)
          }
          placeholder={definition.description || '0'}
          disabled={readOnly}
        />
      )

    case 'date':
      return (
        <Input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={readOnly}
        />
      )

    case 'url':
      return (
        <Input
          type="url"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://..."
          disabled={readOnly}
        />
      )

    case 'checkbox':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={readOnly}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">{definition.description || definition.name}</span>
        </label>
      )

    case 'select':
      return (
        <select
          className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={readOnly}
        >
          <option value="">Select...</option>
          {(definition.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )

    case 'multi_select': {
      const selected: string[] = Array.isArray(value) ? value : []
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {selected.map((v) => {
              const opt = (definition.options || []).find(
                (o) => o.value === v,
              )
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full"
                  style={{
                    backgroundColor: opt?.color
                      ? `${opt.color}20`
                      : '#dbeafe',
                    color: opt?.color || '#2563eb',
                  }}
                >
                  {opt?.label || v}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() =>
                        onChange(selected.filter((s) => s !== v))
                      }
                      className="hover:opacity-70"
                    >
                      &times;
                    </button>
                  )}
                </span>
              )
            })}
          </div>
          {!readOnly && (
            <select
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value=""
              onChange={(e) => {
                if (e.target.value && !selected.includes(e.target.value)) {
                  onChange([...selected, e.target.value])
                }
              }}
            >
              <option value="">Add option...</option>
              {(definition.options || [])
                .filter((o) => !selected.includes(o.value))
                .map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
            </select>
          )}
        </div>
      )
    }

    case 'user':
      return (
        <UserSelect
          value={value || null}
          onChange={(id) => onChange(id)}
          placeholder="Select user..."
        />
      )

    default:
      return (
        <Input
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      )
  }
}

export function CustomFieldsForm({
  definitions,
  values,
  onChange,
  readOnly,
}: CustomFieldsFormProps) {
  if (!definitions || definitions.length === 0) return null

  const getFieldValue = (fieldId: string) => {
    const fv = values.find((v) => v.fieldId === fieldId)
    return fv?.value ?? null
  }

  return (
    <div className="space-y-3">
      {definitions.map((def) => (
        <div key={def.id}>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {def.name}
            {def.isRequired && <span className="text-red-500 ml-0.5">*</span>}
          </label>
          <CustomFieldInput
            definition={def}
            value={getFieldValue(def.id)}
            onChange={(val) => onChange(def.id, val)}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  )
}
