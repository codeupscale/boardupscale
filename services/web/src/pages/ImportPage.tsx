import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileJson,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  FolderOpen,
  Users,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  useUploadJiraFile,
  useImportPreview,
  useStartImport,
  useImportStatus,
  ImportPreview,
  ImportUserMapping,
} from '@/hooks/useImport'
import { useUsers } from '@/hooks/useUsers'
import { User } from '@/types'

type WizardStep = 1 | 2 | 3 | 4

const STEP_LABELS = ['Upload', 'Preview', 'Import', 'Complete'] as const

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
function Stepper({ currentStep }: { currentStep: WizardStep }) {
  return (
    <nav aria-label="Import wizard steps" className="mb-8">
      <ol className="flex items-center justify-center gap-2">
        {STEP_LABELS.map((label, idx) => {
          const step = (idx + 1) as WizardStep
          const isActive = step === currentStep
          const isCompleted = step < currentStep
          return (
            <li key={label} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full text-sm font-semibold transition-colors',
                    isCompleted
                      ? 'bg-blue-600 text-white'
                      : isActive
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    step
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium hidden sm:inline',
                    isActive
                      ? 'text-blue-700 dark:text-blue-300'
                      : isCompleted
                        ? 'text-gray-900 dark:text-gray-100'
                        : 'text-gray-400 dark:text-gray-500',
                  )}
                >
                  {label}
                </span>
              </div>
              {idx < STEP_LABELS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 mx-1" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — Upload
// ---------------------------------------------------------------------------
function UploadStep({
  onUploaded,
}: {
  onUploaded: (filePath: string) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useUploadJiraFile()

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.json')) {
        return
      }
      setSelectedFile(file)
      try {
        const { filePath } = await upload.mutateAsync(file)
        onUploaded(filePath)
      } catch {
        // error handled in hook
      }
    },
    [upload, onUploaded],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const isLoading = upload.isPending

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Import from Jira
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Upload your Jira JSON export file to get started
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleBrowseClick}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
          isDragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50',
          isLoading && 'pointer-events-none opacity-60',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleInputChange}
        />

        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Uploading {selectedFile?.name}...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <FileJson className="h-8 w-8 text-blue-500" />
            </div>
            <div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                Drag and drop your Jira export JSON file here
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                or{' '}
                <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">
                  click to browse
                </span>
              </p>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Only .json files are accepted
            </p>
          </div>
        )}
      </div>

      {upload.isError && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>Upload failed. Please check your file and try again.</span>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — Preview
// ---------------------------------------------------------------------------
function PreviewStep({
  preview,
  userMapping,
  onUserMappingChange,
  onContinue,
  isLoading,
}: {
  preview: ImportPreview
  userMapping: Record<string, string>
  onUserMappingChange: (email: string, userId: string) => void
  onContinue: () => void
  isLoading: boolean
}) {
  const { data: users } = useUsers()

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Preview Import
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Review the data that will be imported into Boardupscale
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="h-10 w-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {preview.projects.length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {preview.projects.length === 1 ? 'Project' : 'Projects'}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="h-10 w-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center">
              <FileJson className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {preview.totalIssues}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Total Issues
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Projects */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Detected Projects
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {preview.projects.map((proj) => (
            <Card key={proj.key}>
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 rounded bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400 flex-shrink-0">
                    {proj.key.slice(0, 2)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {proj.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {proj.key} &middot; {proj.issueCount} issues
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* User Mapping */}
      {preview.users.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            <Users className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
            User Mapping
          </h3>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Jira User
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Boardupscale User
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {preview.users.map((u) => (
                    <UserMappingRow
                      key={u.email}
                      jiraUser={u}
                      users={users || []}
                      selectedUserId={userMapping[u.email] || u.matchedUserId || ''}
                      onChange={(userId) => onUserMappingChange(u.email, userId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onContinue} isLoading={isLoading}>
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function UserMappingRow({
  jiraUser,
  users,
  selectedUserId,
  onChange,
}: {
  jiraUser: ImportUserMapping
  users: User[]
  selectedUserId: string
  onChange: (userId: string) => void
}) {
  return (
    <tr
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 last:border-0',
        !jiraUser.matched && !selectedUserId && 'bg-yellow-50/50 dark:bg-yellow-900/10',
      )}
    >
      <td className="px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100">
        {jiraUser.displayName}
      </td>
      <td className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
        {jiraUser.email}
      </td>
      <td className="px-4 py-2.5">
        {jiraUser.matched && !selectedUserId ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5" />
            Auto-matched
          </span>
        ) : (
          <select
            value={selectedUserId}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              'w-full text-sm rounded-md border px-2 py-1.5 bg-white dark:bg-gray-900',
              'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
              !jiraUser.matched && !selectedUserId && 'border-yellow-400 dark:border-yellow-600',
            )}
          >
            <option value="">-- Unassigned --</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName} ({u.email})
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Step 3 — Import Progress
// ---------------------------------------------------------------------------
function ImportStep({
  jobId,
  onComplete,
}: {
  jobId: string | null
  onComplete: () => void
}) {
  const { data: status } = useImportStatus(jobId)
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  const percentage =
    status && status.total > 0
      ? Math.round((status.processed / status.total) * 100)
      : 0

  // Auto-advance on completion
  useEffect(() => {
    if (status?.status === 'completed' || status?.status === 'failed') {
      const timer = setTimeout(onComplete, 1500)
      return () => clearTimeout(timer)
    }
  }, [status?.status, onComplete])

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {status?.status === 'completed'
            ? 'Import Complete'
            : status?.status === 'failed'
              ? 'Import Failed'
              : 'Importing...'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {status?.status === 'completed'
            ? 'All data has been imported successfully'
            : status?.status === 'failed'
              ? 'The import encountered errors'
              : 'Please wait while your data is being imported'}
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-3">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-out',
              status?.status === 'failed'
                ? 'bg-red-500'
                : status?.status === 'completed'
                  ? 'bg-green-500'
                  : 'bg-blue-500',
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            {status?.processed ?? 0} of {status?.total ?? 0} issues imported
          </span>
          <span className="font-medium text-gray-900 dark:text-gray-100">
            {percentage}%
          </span>
        </div>
      </div>

      {/* Status indicator */}
      <div className="flex justify-center">
        {status?.status === 'processing' || status?.status === 'pending' ? (
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
        ) : status?.status === 'completed' ? (
          <CheckCircle className="h-8 w-8 text-green-500" />
        ) : status?.status === 'failed' ? (
          <AlertTriangle className="h-8 w-8 text-red-500" />
        ) : null}
      </div>

      {/* Errors */}
      {status?.errors && status.errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <button
            onClick={() => setErrorsExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-red-700 dark:text-red-400"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {status.errors.length} {status.errors.length === 1 ? 'error' : 'errors'}
            </span>
            {errorsExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {errorsExpanded && (
            <div className="px-4 pb-3 space-y-1 max-h-48 overflow-y-auto">
              {status.errors.map((err, i) => (
                <p
                  key={i}
                  className="text-xs text-red-600 dark:text-red-400 font-mono"
                >
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Complete
// ---------------------------------------------------------------------------
function CompleteStep({
  importStatus,
  preview,
}: {
  importStatus: {
    status: string
    total: number
    processed: number
    errors: string[]
  } | null
  preview: ImportPreview | null
}) {
  const navigate = useNavigate()

  const isSuccess = importStatus?.status === 'completed'
  const projectCount = preview?.projects.length ?? 0
  const firstProjectKey = preview?.projects[0]?.key

  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div
          className={cn(
            'h-20 w-20 rounded-full flex items-center justify-center',
            isSuccess
              ? 'bg-green-100 dark:bg-green-900/30'
              : 'bg-red-100 dark:bg-red-900/30',
          )}
        >
          {isSuccess ? (
            <CheckCircle className="h-10 w-10 text-green-500" />
          ) : (
            <AlertTriangle className="h-10 w-10 text-red-500" />
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {isSuccess ? 'Import Successful' : 'Import Completed with Errors'}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
          {isSuccess
            ? `Successfully imported ${importStatus?.processed ?? 0} issues from ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`
            : `Imported ${importStatus?.processed ?? 0} of ${importStatus?.total ?? 0} issues with ${importStatus?.errors?.length ?? 0} errors`}
        </p>
      </div>

      {/* Error summary */}
      {importStatus?.errors && importStatus.errors.length > 0 && (
        <Card className="text-left">
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium text-red-700 dark:text-red-400">
                {importStatus.errors.length}{' '}
                {importStatus.errors.length === 1 ? 'error' : 'errors'} during import
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {importStatus.errors.slice(0, 10).map((err, i) => (
                <p
                  key={i}
                  className="text-xs text-red-600 dark:text-red-400 font-mono"
                >
                  {err}
                </p>
              ))}
              {importStatus.errors.length > 10 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ... and {importStatus.errors.length - 10} more
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-center gap-3">
        {firstProjectKey && (
          <Button onClick={() => navigate(`/projects/${firstProjectKey}/board`)}>
            View Project
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" onClick={() => navigate('/projects')}>
          All Projects
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Wizard Page
// ---------------------------------------------------------------------------
export function ImportPage() {
  const [step, setStep] = useState<WizardStep>(1)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [userMapping, setUserMapping] = useState<Record<string, string>>({})
  const [jobId, setJobId] = useState<string | null>(null)

  const previewMutation = useImportPreview()
  const startImport = useStartImport()
  const { data: importStatus } = useImportStatus(jobId)

  // Step 1 -> Step 2: upload complete, fetch preview
  const handleUploaded = useCallback(
    async (path: string) => {
      setFilePath(path)
      try {
        const data = await previewMutation.mutateAsync(path)
        setPreview(data)

        // Pre-populate user mapping with auto-matched users
        const mapping: Record<string, string> = {}
        data.users.forEach((u) => {
          if (u.matched && u.matchedUserId) {
            mapping[u.email] = u.matchedUserId
          }
        })
        setUserMapping(mapping)

        setStep(2)
      } catch {
        // error handled in hook
      }
    },
    [previewMutation],
  )

  // Step 2 -> Step 3: start import
  const handleStartImport = useCallback(async () => {
    if (!filePath) return
    try {
      const { jobId: id } = await startImport.mutateAsync({
        filePath,
        userMapping,
      })
      setJobId(id)
      setStep(3)
    } catch {
      // error handled in hook
    }
  }, [filePath, userMapping, startImport])

  // Step 3 -> Step 4
  const handleImportComplete = useCallback(() => {
    setStep(4)
  }, [])

  const handleUserMappingChange = useCallback(
    (email: string, userId: string) => {
      setUserMapping((prev) => ({ ...prev, [email]: userId }))
    },
    [],
  )

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <Stepper currentStep={step} />

        {step === 1 && <UploadStep onUploaded={handleUploaded} />}

        {step === 2 && preview && (
          <PreviewStep
            preview={preview}
            userMapping={userMapping}
            onUserMappingChange={handleUserMappingChange}
            onContinue={handleStartImport}
            isLoading={startImport.isPending}
          />
        )}

        {step === 3 && (
          <ImportStep jobId={jobId} onComplete={handleImportComplete} />
        )}

        {step === 4 && (
          <CompleteStep importStatus={importStatus ?? null} preview={preview} />
        )}
      </div>
    </div>
  )
}
