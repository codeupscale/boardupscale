import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Project, ProjectType } from '@/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
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
})

type FormValues = z.infer<typeof schema>

interface ProjectFormProps {
  project?: Project
  onSubmit: (values: FormValues) => void
  onCancel: () => void
  isLoading?: boolean
  submitLabel?: string
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
    },
  })

  const name = watch('name')

  // Auto-generate key from name (only when creating new project)
  useEffect(() => {
    if (!project && name) {
      setValue('key', slugify(name).slice(0, 10))
    }
  }, [name, project, setValue])

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
