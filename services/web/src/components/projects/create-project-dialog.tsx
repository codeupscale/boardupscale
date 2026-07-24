import { useTranslation } from 'react-i18next'
import { ProjectForm } from '@/components/projects/project-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateProject } from '@/hooks/useProjects'

interface CreateProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Shared create-project modal used by Projects page and Org Owner dashboard. */
export function CreateProjectDialog({ open, onOpenChange }: CreateProjectDialogProps) {
  const { t } = useTranslation()
  const createProject = useCreateProject()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onOpenChange(false)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('projects.createNewProject')}</DialogTitle>
        </DialogHeader>
        <ProjectForm
          onSubmit={(values) =>
            createProject.mutate(
              {
                name: values.name,
                key: values.key,
                description: values.description,
                type: values.type,
                templateType: values.templateType,
              },
              { onSuccess: () => onOpenChange(false) },
            )
          }
          onCancel={() => onOpenChange(false)}
          isLoading={createProject.isPending}
        />
      </DialogContent>
    </Dialog>
  )
}
