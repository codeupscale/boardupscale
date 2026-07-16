import { useState, useCallback, useMemo, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { IssueType } from '@/types'
import {
  issueTicketFormSchema,
  type IssueTicketFormValues,
  type StagedIssueLink,
  type IssueTicketFormPayload,
  cleanIssueTicketPayload,
  defaultIssueTicketFormValues,
} from './issue-ticket-form.schema'

export interface UseIssueTicketFormOptions {
  defaultValues?: Partial<IssueTicketFormValues>
  initialLabels?: string[]
}

function labelsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((value, index) => value === sortedB[index])
}

export function useIssueTicketForm({
  defaultValues,
  initialLabels,
}: UseIssueTicketFormOptions = {}) {
  // Hydrate labels once on mount (form remounts via formKey on open).
  // Do NOT sync on every initialLabels reference change — that wiped Enter-added chips.
  const hydratedLabelsRef = useRef<string[]>(
    Array.isArray(initialLabels) ? [...initialLabels] : [],
  )
  const [labels, setLabels] = useState<string[]>(() => [...hydratedLabelsRef.current])
  const [attachments, setAttachments] = useState<File[]>([])
  const [descriptionAttachments, setDescriptionAttachments] = useState<
    Array<{ id: string; fileName: string; mimeType?: string }>
  >([])
  const [stagedLinks, setStagedLinks] = useState<StagedIssueLink[]>([])

  const form = useForm<IssueTicketFormValues>({
    resolver: zodResolver(issueTicketFormSchema),
    defaultValues: {
      ...defaultIssueTicketFormValues,
      ...defaultValues,
    },
  })

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = form

  const watchedType = useWatch({ control, name: 'type' }) || IssueType.TASK

  const labelsDirty = !labelsEqual(labels, hydratedLabelsRef.current)

  const hasLocalChanges =
    labelsDirty ||
    attachments.length > 0 ||
    descriptionAttachments.length > 0 ||
    stagedLinks.length > 0

  const isFormDirty = isDirty || hasLocalChanges

  const buildPayload = useCallback(
    (values: IssueTicketFormValues): IssueTicketFormPayload =>
      cleanIssueTicketPayload(values, labels),
    [labels],
  )

  const resetForm = useCallback(
    (nextDefaults?: Partial<IssueTicketFormValues>) => {
      reset({
        ...defaultIssueTicketFormValues,
        ...defaultValues,
        ...nextDefaults,
      })
      setLabels([...hydratedLabelsRef.current])
      setAttachments([])
      setDescriptionAttachments([])
      setStagedLinks([])
    },
    [reset, defaultValues],
  )

  const addLabel = useCallback((label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    setLabels((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]))
  }, [])

  const removeLabel = useCallback((label: string) => {
    setLabels((prev) => prev.filter((l) => l !== label))
  }, [])

  const addDescriptionUpload = useCallback(
    (
      attachmentId: string,
      meta?: { fileName?: string; mimeType?: string; file?: File },
    ) => {
      if (!attachmentId) return
      setDescriptionAttachments((prev) => {
        if (prev.some((a) => a.id === attachmentId)) return prev
        return [
          ...prev,
          {
            id: attachmentId,
            fileName: meta?.fileName || attachmentId,
            mimeType: meta?.mimeType,
          },
        ]
      })
      void meta?.file
    },
    [],
  )

  const removeDescriptionUpload = useCallback((attachmentId: string) => {
    if (!attachmentId) return
    setDescriptionAttachments((prev) => prev.filter((a) => a.id !== attachmentId))
  }, [])

  const addAttachment = useCallback((files: File[]) => {
    setAttachments((prev) => {
      const next = [...prev]
      for (const file of files) {
        const exists = next.some(
          (x) =>
            x.name === file.name &&
            x.size === file.size &&
            x.lastModified === file.lastModified,
        )
        if (!exists) next.push(file)
      }
      return next
    })
  }, [])

  const removeAttachment = useCallback((file: File) => {
    setAttachments((prev) => prev.filter((f) => f !== file))
  }, [])

  const addStagedLink = useCallback((link: StagedIssueLink) => {
    setStagedLinks((prev) => {
      if (prev.some((l) => l.targetIssueId === link.targetIssueId)) return prev
      return [...prev, link]
    })
  }, [])

  const removeStagedLink = useCallback((targetIssueId: string) => {
    setStagedLinks((prev) => prev.filter((l) => l.targetIssueId !== targetIssueId))
  }, [])

  const localState = useMemo(
    () => ({
      labels,
      setLabels,
      attachments,
      setAttachments,
      descriptionAttachments,
      descriptionAttachmentIds: descriptionAttachments.map((a) => a.id),
      stagedLinks,
      setStagedLinks,
      addLabel,
      removeLabel,
      addAttachment,
      removeAttachment,
      addDescriptionUpload,
      removeDescriptionUpload,
      addStagedLink,
      removeStagedLink,
    }),
    [
      labels,
      attachments,
      descriptionAttachments,
      stagedLinks,
      addLabel,
      removeLabel,
      addAttachment,
      removeAttachment,
      addDescriptionUpload,
      removeDescriptionUpload,
      addStagedLink,
      removeStagedLink,
    ],
  )

  return {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    errors,
    isFormDirty,
    watchedType,
    buildPayload,
    resetForm,
    localState,
  }
}

export type IssueTicketFormState = ReturnType<typeof useIssueTicketForm>
