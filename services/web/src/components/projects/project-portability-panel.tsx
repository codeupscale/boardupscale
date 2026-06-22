import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ProjectType } from '@/types'
import { isKanbanProject } from '@/lib/project-workflow'
import { cn } from '@/lib/utils'
import {
  useCancelPortabilityImport,
  useExportProjectBundle,
  usePortabilityJobStatus,
  usePortabilityPhaseLabel,
  usePortabilityProgressSocket,
  usePreviewPortabilityImport,
  useRetryPortabilityImport,
  useStartPortabilityImport,
  useUndoPortabilityImport,
  useUploadPortabilityBundle,
  type ImportPreviewResult,
} from '@/hooks/useProjectPortability'

type ImportStep = 'upload' | 'configure' | 'preview' | 'importing' | 'complete'
type ImportDestination = 'this-project' | 'new-project'

interface ProjectPortabilityPanelProps {
  projectId: string
  projectKey: string
  projectName: string
  projectType: ProjectType
  canExport: boolean
  canImport: boolean
}

const SESSION_KEY = 'boardupscale_active_portability_job'

export function ProjectPortabilityPanel({
  projectId,
  projectKey,
  projectName,
  projectType,
  canExport,
  canImport,
}: ProjectPortabilityPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const phaseLabel = usePortabilityPhaseLabel()
  const importCompleteHandled = useRef(false)

  const exportBundle = useExportProjectBundle(projectKey)
  const uploadBundle = useUploadPortabilityBundle()
  const previewImport = usePreviewPortabilityImport()
  const startImport = useStartPortabilityImport()
  const cancelImport = useCancelPortabilityImport()
  const retryImport = useRetryPortabilityImport()
  const undoImport = useUndoPortabilityImport()

  const [importStep, setImportStep] = useState<ImportStep>('upload')
  const [importDestination, setImportDestination] = useState<ImportDestination>('this-project')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [uploadMeta, setUploadMeta] = useState<{
    sourceProjectKey: string
    sourceType: ProjectType
    issueCount: number
  } | null>(null)
  const [targetType, setTargetType] = useState<ProjectType>(projectType)
  const [targetKey, setTargetKey] = useState('')
  const [targetName, setTargetName] = useState('')
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null)
  const [checksum, setChecksum] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY)
    } catch {
      return null
    }
  })
  const [socketTick, setSocketTick] = useState(0)

  const mergeIntoThisProject = importDestination === 'this-project'

  const { data: jobStatus, refetch: refetchStatus } = usePortabilityJobStatus(
    activeJobId,
    !!activeJobId,
  )

  usePortabilityProgressSocket(activeJobId, () => {
    setSocketTick((n) => n + 1)
    void refetchStatus()
  })

  useEffect(() => {
    if (!activeJobId) return
    try {
      sessionStorage.setItem(SESSION_KEY, activeJobId)
    } catch {
      // ignore
    }
  }, [activeJobId])

  useEffect(() => {
    if (!jobStatus) return
    if (jobStatus.status === 'processing' || jobStatus.status === 'pending') {
      setImportStep('importing')
    } else if (jobStatus.status === 'completed' || jobStatus.status === 'undone') {
      setImportStep('complete')
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch {
        // ignore
      }
    } else if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
      setImportStep('complete')
    }
  }, [jobStatus?.status, jobStatus?.isStalled])

  useEffect(() => {
    if (jobStatus?.status !== 'completed') {
      importCompleteHandled.current = false
      return
    }
    if (importCompleteHandled.current) return
    importCompleteHandled.current = true

    const boardKey = jobStatus.targetProjectKey ?? projectKey
    void queryClient.invalidateQueries({ queryKey: ['board'] })
    void queryClient.invalidateQueries({ queryKey: ['board-column'] })
    void queryClient.invalidateQueries({ queryKey: ['issues'] })
    void queryClient.invalidateQueries({ queryKey: ['projects'] })
    void queryClient.refetchQueries({ queryKey: ['board', boardKey] })
  }, [jobStatus?.status, jobStatus?.targetProjectKey, projectKey, queryClient])

  const progressPercent = useMemo(() => {
    void socketTick
    if (!jobStatus) return 0
    if (jobStatus.status === 'completed') return 100
    if (jobStatus.status === 'failed' || jobStatus.status === 'cancelled') {
      return jobStatus.processedIssues > 0 ? 90 : 0
    }

    const phase = jobStatus.currentPhase ?? 0
    const phaseBase: Record<number, number> = {
      1: 5,
      2: 8,
      3: 12,
      4: 15,
      5: 72,
      6: 76,
      7: 80,
      8: 84,
      9: 87,
      10: 90,
      11: 92,
      12: 94,
    }
    const base = phaseBase[phase] ?? 5

    const issueTotal = jobStatus.totalIssues ?? 0
    const issueDone = jobStatus.processedIssues ?? 0
    if (phase === 4 && issueTotal > 0) {
      const issueSlice = Math.round((issueDone / issueTotal) * 55)
      return Math.min(72, base + issueSlice)
    }

    if (phase === 5 && (jobStatus.totalComments ?? 0) > 0) {
      const commentSlice = Math.round(
        ((jobStatus.processedComments ?? 0) / jobStatus.totalComments) * 4,
      )
      return Math.min(94, base + commentSlice)
    }

    if (phase === 12 && (jobStatus.totalAttachments ?? 0) > 0) {
      const attachmentSlice = Math.round(
        ((jobStatus.processedAttachments ?? 0) / jobStatus.totalAttachments) * 5,
      )
      return Math.min(99, base + attachmentSlice)
    }

    return base
  }, [jobStatus, socketTick])

  const buildImportPayload = () => {
    const base = {
      filePath: filePath!,
      importComments: true,
      importMembers: true,
      importCustomFields: true,
      importSprints: !isKanbanProject(mergeIntoThisProject ? projectType : targetType),
      importComponents: true,
      importVersions: true,
      importAttachments: true,
      importIssueLinks: true,
      importWatchers: true,
      importWorkLogs: true,
      importProjectSettings: true,
      preserveIssueNumbers: true,
      preserveTimestamps: true,
    }
    if (mergeIntoThisProject) {
      return { ...base, targetProjectId: projectId }
    }
    return {
      ...base,
      targetType,
      targetProjectKey: targetKey.trim().toUpperCase(),
      targetProjectName: targetName.trim(),
    }
  }

  const handleFileSelect = async (file: File | null) => {
    if (!file) return
    const result = await uploadBundle.mutateAsync(file)
    setFilePath(result.filePath)
    setUploadMeta({
      sourceProjectKey: result.sourceProjectKey,
      sourceType: result.sourceType,
      issueCount: result.issueCount,
    })
    setImportDestination('this-project')
    setTargetType(projectType)
    const suggestedKey = `${result.sourceProjectKey}2`.slice(0, 10).toUpperCase()
    setTargetKey(suggestedKey)
    setTargetName(`${result.sourceProjectKey} Import`)
    setImportStep('configure')
  }

  const handlePreview = async () => {
    if (!filePath) return
    if (!mergeIntoThisProject && (!targetKey.trim() || !targetName.trim())) return
    const result = await previewImport.mutateAsync(buildImportPayload())
    setPreview(result.preview)
    setChecksum(result.checksum)
    setImportStep('preview')
  }

  const handleStartImport = async () => {
    if (!filePath) return
    if (!mergeIntoThisProject && (!targetKey.trim() || !targetName.trim())) return
    const result = await startImport.mutateAsync({
      ...buildImportPayload(),
      previewChecksum: checksum ?? undefined,
    })
    setActiveJobId(result.jobId)
    setImportStep('importing')
  }

  const resetImport = () => {
    setImportStep('upload')
    setImportDestination('this-project')
    setFilePath(null)
    setUploadMeta(null)
    setPreview(null)
    setChecksum(null)
    setActiveJobId(null)
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* Export */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Export project</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Download a full bundle (issues, statuses, sprints, members, comments, custom fields)
            for backup or import into this or another project.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Badge variant="outline">{projectType}</Badge>
          <span>{projectName}</span>
          <span className="text-muted-foreground/60">({projectKey})</span>
        </div>
        <Button
          onClick={() => exportBundle.mutate()}
          disabled={!canExport || exportBundle.isPending}
          isLoading={exportBundle.isPending}
        >
          <Download className="h-4 w-4" />
          Export full bundle (.json)
        </Button>
      </section>

      {/* Import */}
      {canImport && (
        <section className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Import bundle</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              By default, issues and related data are merged into{' '}
              <span className="font-medium text-foreground">{projectName}</span>. You can optionally
              create a separate project instead.
            </p>
          </div>

          {importStep === 'upload' && (
            <label
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border',
                'p-10 cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-colors',
              )}
            >
              <FileUp className="h-10 w-10 text-muted-foreground" />
              <span className="text-sm font-medium">Drop bundle JSON or click to upload</span>
              <span className="text-xs text-muted-foreground">Max 100 MB · same organization only</span>
              <input
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => void handleFileSelect(e.target.files?.[0] ?? null)}
                disabled={uploadBundle.isPending}
              />
              {uploadBundle.isPending && (
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                </span>
              )}
            </label>
          )}

          {importStep === 'configure' && uploadMeta && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">{uploadMeta.sourceProjectKey}</span>
                {' · '}
                <Badge variant="outline" className="text-xs">{uploadMeta.sourceType}</Badge>
                {' · '}
                {uploadMeta.issueCount} issues
              </div>

              <div className="space-y-2">
                <Label>Import destination</Label>
                <Select
                  value={importDestination}
                  onValueChange={(v) => setImportDestination(v as ImportDestination)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="this-project">
                      Into this project — {projectName} ({projectKey})
                    </SelectItem>
                    <SelectItem value="new-project">Create a new project</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mergeIntoThisProject ? (
                <div className="rounded-lg border border-border p-3 text-sm space-y-1">
                  <p className="font-medium">{projectName}</p>
                  <p className="text-muted-foreground">
                    <Badge variant="outline" className="text-xs mr-2">{projectType}</Badge>
                    {projectKey} · existing issues are kept; new issues are appended
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>New project name</Label>
                    <Input
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      placeholder="Imported Project"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>New project key</Label>
                    <Input
                      value={targetKey}
                      onChange={(e) => setTargetKey(e.target.value.toUpperCase())}
                      placeholder="PROJ2"
                      maxLength={10}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Methodology</Label>
                    <Select
                      value={targetType}
                      onValueChange={(v) => setTargetType(v as ProjectType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ProjectType.SCRUM}>Scrum</SelectItem>
                        <SelectItem value={ProjectType.KANBAN}>Kanban</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={resetImport}>Back</Button>
                <Button
                  onClick={() => void handlePreview()}
                  disabled={
                    (!mergeIntoThisProject && (!targetKey.trim() || !targetName.trim())) ||
                    previewImport.isPending
                  }
                  isLoading={previewImport.isPending}
                >
                  Preview import
                </Button>
              </div>
            </div>
          )}

          {importStep === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-muted-foreground text-xs">Issues</p>
                  <p className="text-lg font-semibold">{preview.totalIssues}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-muted-foreground text-xs">Sprints (target)</p>
                  <p className="text-lg font-semibold">{preview.totalSprints}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-muted-foreground text-xs">Est. time</p>
                  <p className="text-lg font-semibold">~{preview.estimatedSeconds}s</p>
                </div>
              </div>

              {preview.dataLossItems.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" />
                    Data that will not be preserved
                  </p>
                  <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                    {preview.dataLossItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div className="space-y-2">
                  {preview.warnings.map((w) => (
                    <div
                      key={w.code}
                      className="text-sm rounded-md bg-muted/60 px-3 py-2 text-muted-foreground"
                    >
                      {w.message}
                    </div>
                  ))}
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Status mapping</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">→</th>
                        <th className="px-3 py-2">Target</th>
                        <th className="px-3 py-2">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.statusMappings.map((m) => (
                        <tr key={`${m.sourceName}-${m.targetName}`}>
                          <td className="px-3 py-2">{m.sourceName}</td>
                          <td className="px-3 py-2 text-muted-foreground">→</td>
                          <td className="px-3 py-2">{m.targetName}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-xs">{m.method}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setImportStep('configure')}>Back</Button>
                <Button
                  onClick={() => void handleStartImport()}
                  isLoading={startImport.isPending}
                >
                  <Upload className="h-4 w-4" />
                  Confirm &amp; start import
                </Button>
              </div>
            </div>
          )}

          {(importStep === 'importing' || importStep === 'complete') && jobStatus && (
            <div className="space-y-4">
              {jobStatus.isStalled && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Import stalled
                  </p>
                  {jobStatus.stallReason && (
                    <p className="text-sm text-muted-foreground">{jobStatus.stallReason}</p>
                  )}
                  {jobStatus.workerHint && (
                    <p className="text-xs text-muted-foreground">{jobStatus.workerHint}</p>
                  )}
                  {jobStatus.bullmqState && (
                    <p className="text-xs text-muted-foreground">
                      Queue state: {jobStatus.bullmqState}
                      {jobStatus.pendingSeconds != null && jobStatus.pendingSeconds > 0 && (
                        <> · waiting {jobStatus.pendingSeconds}s</>
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                {jobStatus.status === 'processing' || (jobStatus.status === 'pending' && !jobStatus.isStalled) ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : jobStatus.status === 'completed' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <div>
                  <p className="font-medium capitalize">
                    {jobStatus.isStalled && jobStatus.status === 'pending' ? 'stalled' : jobStatus.status}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {phaseLabel(jobStatus.currentPhase)}
                    {jobStatus.totalIssues > 0 && (
                      <> · {jobStatus.processedIssues}/{jobStatus.totalIssues} issues</>
                    )}
                  </p>
                </div>
              </div>

              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {jobStatus.errorLog && jobStatus.errorLog.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive max-h-32 overflow-y-auto">
                  {jobStatus.errorLog.slice(0, 5).map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {jobStatus.canCancel !== false &&
                  (jobStatus.status === 'processing' || jobStatus.status === 'pending') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelImport.mutate(jobStatus.id)}
                    disabled={cancelImport.isPending}
                  >
                    Cancel
                  </Button>
                )}
                {jobStatus.canRetry && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      retryImport.mutate(jobStatus.id, {
                        onSuccess: () => setImportStep('importing'),
                      })
                    }}
                    disabled={retryImport.isPending}
                    isLoading={retryImport.isPending}
                  >
                    Retry import
                  </Button>
                )}
                {jobStatus.status === 'completed' && jobStatus.targetProjectKey && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        const boardKey = jobStatus.targetProjectKey ?? projectKey
                        void queryClient.refetchQueries({ queryKey: ['board', boardKey] })
                        navigate(`/projects/${boardKey}/board`)
                      }}
                    >
                      {jobStatus.targetProjectKey === projectKey ? 'Open board' : 'Open imported project'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => undoImport.mutate(jobStatus.id)}
                      disabled={undoImport.isPending}
                    >
                      Undo import
                    </Button>
                  </>
                )}
                {['completed', 'failed', 'cancelled', 'undone'].includes(jobStatus.status) && (
                  <Button variant="outline" size="sm" onClick={resetImport}>
                    Import another
                  </Button>
                )}
              </div>

              {jobStatus.status === 'completed' && jobStatus.resultSummary && (
                <div className="text-sm text-muted-foreground space-y-1">
                  {jobStatus.resultSummary.sprintsStripped != null &&
                    jobStatus.resultSummary.sprintsStripped > 0 && (
                      <p>{jobStatus.resultSummary.sprintsStripped} sprint assignments cleared</p>
                    )}
                  {jobStatus.resultSummary.backlogRemapped != null &&
                    jobStatus.resultSummary.backlogRemapped > 0 && (
                      <p>{jobStatus.resultSummary.backlogRemapped} issues backlog-remapped</p>
                    )}
                  {jobStatus.resultSummary.failedIssueCount != null &&
                    jobStatus.resultSummary.failedIssueCount > 0 && (
                      <p className="text-amber-600">
                        {jobStatus.resultSummary.failedIssueCount} issues failed
                      </p>
                    )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
