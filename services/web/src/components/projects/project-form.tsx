import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, ProjectType, ProjectTemplate, TemplateCategory } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { slugify, cn } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  key: z
    .string()
    .min(2, 'Key must be at least 2 characters')
    .max(10, 'Key must be at most 10 characters')
    .regex(/^[A-Z0-9]+$/, 'Key must be uppercase letters and numbers only'),
  description: z.string().max(500).optional(),
  type: z.nativeEnum(ProjectType),
  templateType: z.nativeEnum(ProjectTemplate).optional(),
})

type FormValues = z.infer<typeof schema>

interface ProjectFormProps {
  project?: Project
  onSubmit: (values: FormValues) => void
  onCancel: () => void
  isLoading?: boolean
  submitLabel?: string
}

const TEMPLATE_ICONS: Record<string, string> = {
  [ProjectTemplate.SCRUM]: '\u{1F3C3}',
  [ProjectTemplate.KANBAN]: '\u{1F4CB}',
  [ProjectTemplate.BUG_TRACKING]: '\u{1F41B}',
  [ProjectTemplate.BLANK]: '\u{1F4C4}',
  [ProjectTemplate.CAMPAIGN_MANAGEMENT]: '\u{1F4E3}',
  [ProjectTemplate.CONTENT_CALENDAR]: '\u{1F4C5}',
  [ProjectTemplate.SALES_PIPELINE]: '\u{1F4B0}',
  [ProjectTemplate.RECRUITMENT]: '\u{1F465}',
  [ProjectTemplate.ONBOARDING]: '\u{1F44B}',
  [ProjectTemplate.IT_SERVICE]: '\u{1F527}',
  [ProjectTemplate.TASK_TRACKING]: '\u{2705}',
}

interface TemplateOption {
  value: ProjectTemplate
  label: string
  description: string
  category: TemplateCategory
}

const CATEGORY_ORDER: TemplateCategory[] = ['all', 'software', 'marketing', 'sales', 'hr', 'operations']

export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: ProjectFormProps) {
  const { t } = useTranslation()
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>('all')
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: project?.name || '',
      key: project?.key || '',
      description: project?.description || '',
      type: project?.type || ProjectType.SCRUM,
      templateType: ProjectTemplate.SCRUM,
    },
  })

  const name = watch('name')
  const selectedTemplate = watch('templateType')

  // Auto-generate key from name (only when creating new project)
  useEffect(() => {
    if (!project && name) {
      setValue('key', slugify(name).slice(0, 10))
    }
  }, [name, project, setValue])

  const templates: TemplateOption[] = [
    // Software
    { value: ProjectTemplate.SCRUM, label: t('projects.templateScrum'), description: t('projects.templateScrumDesc'), category: 'software' },
    { value: ProjectTemplate.KANBAN, label: t('projects.templateKanban'), description: t('projects.templateKanbanDesc'), category: 'software' },
    { value: ProjectTemplate.BUG_TRACKING, label: t('projects.templateBugTracking'), description: t('projects.templateBugTrackingDesc'), category: 'software' },
    { value: ProjectTemplate.BLANK, label: t('projects.templateBlank'), description: t('projects.templateBlankDesc'), category: 'software' },
    // Marketing
    { value: ProjectTemplate.CAMPAIGN_MANAGEMENT, label: t('projects.templateCampaignManagement'), description: t('projects.templateCampaignManagementDesc'), category: 'marketing' },
    { value: ProjectTemplate.CONTENT_CALENDAR, label: t('projects.templateContentCalendar'), description: t('projects.templateContentCalendarDesc'), category: 'marketing' },
    // Sales
    { value: ProjectTemplate.SALES_PIPELINE, label: t('projects.templateSalesPipeline'), description: t('projects.templateSalesPipelineDesc'), category: 'sales' },
    // HR
    { value: ProjectTemplate.RECRUITMENT, label: t('projects.templateRecruitment'), description: t('projects.templateRecruitmentDesc'), category: 'hr' },
    { value: ProjectTemplate.ONBOARDING, label: t('projects.templateOnboarding'), description: t('projects.templateOnboardingDesc'), category: 'hr' },
    // Operations
    { value: ProjectTemplate.IT_SERVICE, label: t('projects.templateITService'), description: t('projects.templateITServiceDesc'), category: 'operations' },
    { value: ProjectTemplate.TASK_TRACKING, label: t('projects.templateTaskTracking'), description: t('projects.templateTaskTrackingDesc'), category: 'operations' },
  ]

  const filteredTemplates = activeCategory === 'all'
    ? templates
    : templates.filter((tmpl) => tmpl.category === activeCategory)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Template Selection - only show for new projects */}
      {!project && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('projects.template')}
          </label>

          {/* Category Tabs */}
          <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
            {CATEGORY_ORDER.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                  activeCategory === cat
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800'
                )}
              >
                {t(`projects.category${cat.charAt(0).toUpperCase() + cat.slice(1)}`)}
              </button>
            ))}
          </div>

          {/* Template Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
            {filteredTemplates.map((tmpl) => (
              <button
                key={tmpl.value}
                type="button"
                onClick={() => setValue('templateType', tmpl.value)}
                className={cn(
                  'flex flex-col items-start p-3 rounded-lg border-2 text-left transition-colors',
                  selectedTemplate === tmpl.value
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    : 'border-gray-200 hover:border-gray-300 bg-white dark:border-gray-700 dark:hover:border-gray-600 dark:bg-gray-800'
                )}
              >
                <span className="text-lg mb-1">{TEMPLATE_ICONS[tmpl.value] || '\u{1F4C4}'}</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {tmpl.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                  {tmpl.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Input
        label={t('projects.projectName')}
        placeholder="My Awesome Project"
        error={errors.name?.message}
        {...register('name')}
      />

      <Input
        label={t('projects.projectKey')}
        placeholder="MAP"
        error={errors.key?.message}
        helperText={t('projects.projectKeyHelper')}
        {...register('key')}
        onChange={(e) => {
          e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
          register('key').onChange(e)
        }}
      />

      <Textarea
        label={t('common.description')}
        placeholder={t('projects.whatIsProject')}
        rows={3}
        {...register('description')}
      />

      <Controller
        name="type"
        control={control}
        render={({ field }) => (
          <Select
            label={t('projects.projectType')}
            options={[
              { value: ProjectType.SCRUM, label: t('projects.scrum') },
              { value: ProjectType.KANBAN, label: t('projects.kanban') },
            ]}
            {...field}
          />
        )}
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" isLoading={isLoading}>
          {submitLabel || t('projects.createProject')}
        </Button>
      </div>
    </form>
  )
}
