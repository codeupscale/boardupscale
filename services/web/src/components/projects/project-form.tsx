import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, ProjectType, ProjectTemplate } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { slugify } from '@/lib/utils'

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
}

export function ProjectForm({
  project,
  onSubmit,
  onCancel,
  isLoading,
  submitLabel,
}: ProjectFormProps) {
  const { t } = useTranslation()
  const {
    register,
    handleSubmit,
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

  // Auto-set project type based on selected template
  useEffect(() => {
    if (!project && selectedTemplate) {
      const type = selectedTemplate === ProjectTemplate.KANBAN
        ? ProjectType.KANBAN
        : ProjectType.SCRUM
      setValue('type', type)
    }
  }, [selectedTemplate, project, setValue])

  const templates = [
    {
      value: ProjectTemplate.SCRUM,
      label: t('projects.templateScrum'),
      description: t('projects.templateScrumDesc'),
    },
    {
      value: ProjectTemplate.KANBAN,
      label: t('projects.templateKanban'),
      description: t('projects.templateKanbanDesc'),
    },
    {
      value: ProjectTemplate.BUG_TRACKING,
      label: t('projects.templateBugTracking'),
      description: t('projects.templateBugTrackingDesc'),
    },
    {
      value: ProjectTemplate.BLANK,
      label: t('projects.templateBlank'),
      description: t('projects.templateBlankDesc'),
    },
  ]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Template Selection - only show for new projects */}
      {!project && (
        <div>
          <label className="block text-sm font-medium text-foreground/80 mb-2">
            {t('projects.template')}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((tmpl) => (
              <button
                key={tmpl.value}
                type="button"
                onClick={() => setValue('templateType', tmpl.value)}
                className={`flex flex-col items-start p-3 rounded-lg border-2 text-left transition-colors ${
                  selectedTemplate === tmpl.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-border/80 bg-card'
                }`}
              >
                <span className="text-sm font-medium text-foreground">
                  {tmpl.label}
                </span>
                <span className="text-xs text-muted-foreground mt-0.5">
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
