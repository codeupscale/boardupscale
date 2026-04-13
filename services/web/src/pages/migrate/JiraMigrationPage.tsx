import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, CheckCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectStep } from './steps/ConnectStep'
import { PreviewStep } from './steps/PreviewStep'
import { ConfigureStep } from './steps/ConfigureStep'
import { ProgressStep } from './steps/ProgressStep'
import { CompleteStep } from './steps/CompleteStep'
import { ConnectJiraResult, PreviewProject, StartMigrationPayload } from '@/hooks/useMigration'

type WizardStep = 1 | 2 | 3 | 4 | 5

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Connect',
  2: 'Preview',
  3: 'Configure',
  4: 'Migrate',
  5: 'Complete',
}

// Steps that need the full wide layout (have side-by-side panels)
const WIDE_STEPS: WizardStep[] = [2]

function Stepper({ currentStep }: { currentStep: WizardStep }) {
  const steps = [1, 2, 3, 4, 5] as WizardStep[]
  return (
    <nav aria-label="Migration wizard steps" className="mb-8">
      <ol className="flex items-center justify-center gap-1 sm:gap-2">
        {steps.map((step, idx) => {
          const isActive = step === currentStep
          const isCompleted = step < currentStep
          return (
            <li key={step} className="flex items-center gap-1 sm:gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold transition-all flex-shrink-0',
                    isCompleted
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                      : isActive
                      ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/40 shadow-sm shadow-blue-200'
                      : 'bg-muted text-muted-foreground',
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isCompleted ? <CheckCircle className="h-4 w-4" /> : step}
                </span>
                <span
                  className={cn(
                    'text-xs sm:text-sm font-semibold hidden sm:inline',
                    isActive
                      ? 'text-blue-700 dark:text-blue-300'
                      : isCompleted
                      ? 'text-gray-700 dark:text-gray-200'
                      : 'text-muted-foreground',
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mx-1" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function JiraMigrationPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState<WizardStep>(1)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // Wizard state accumulated across steps
  const [connectResult, setConnectResult] = useState<ConnectJiraResult | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[] | undefined>(undefined)
  const [selectedProjects, setSelectedProjects] = useState<PreviewProject[]>([])
  const [migrationPayload, setMigrationPayload] = useState<StartMigrationPayload | null>(null)
  const [completedRunId, setCompletedRunId] = useState<string | null>(null)
  const [isRestored, setIsRestored] = useState(false)

  // On mount: restore state from OAuth redirect params
  useEffect(() => {
    const isOAuth = searchParams.get('oauth') === '1'
    const oauthErr = searchParams.get('oauthError')
    const runId = searchParams.get('runId')
    const connId = searchParams.get('connectionId')
    const orgName = searchParams.get('orgName') ?? 'Jira'
    const projectCount = parseInt(searchParams.get('projectCount') ?? '0', 10)
    const memberCount = parseInt(searchParams.get('memberCount') ?? '0', 10)

    if (isOAuth || oauthErr) {
      setSearchParams({}, { replace: true })
    }

    if (oauthErr) {
      setOauthError(oauthErr)
      return
    }

    if (isOAuth && runId && connId) {
      const result: ConnectJiraResult = {
        runId,
        connectionId: connId,
        displayName: orgName,
        orgName,
        projectCount,
        memberCount,
        projects: [],
      }
      setConnectResult(result)
      setConnectionId(connId)
      setStep(2)
    }

    if (!isOAuth && !oauthErr) {
      const saved = sessionStorage.getItem('boardupscale_active_migration')
      if (saved) {
        try {
          const savedPayload: StartMigrationPayload = JSON.parse(saved)
          if (savedPayload?.runId) {
            setMigrationPayload(savedPayload)
            setIsRestored(true)
            setStep(4)
          }
        } catch {
          sessionStorage.removeItem('boardupscale_active_migration')
        }
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnect(result: ConnectJiraResult) {
    setConnectResult(result)
    if (result.connectionId) {
      setConnectionId(result.connectionId)
    }
    setStep(2)
  }

  function handlePreview(keys: string[], projects: PreviewProject[], memberIds: string[] | undefined) {
    setSelectedKeys(keys)
    setSelectedProjects(projects)
    setSelectedMemberIds(memberIds)
    setStep(3)
  }

  function handleConfigure(config: {
    statusMapping: Record<string, string>
    options: { importComments: boolean; importAttachments: boolean; inviteMembers: boolean }
    roleMapping: Record<string, string>
  }) {
    if (!connectResult) return
    const payload: StartMigrationPayload = {
      runId: connectResult.runId,
      projectKeys: selectedKeys,
      selectedMemberIds,
      statusMapping: config.statusMapping,
      roleMapping: config.roleMapping,
      options: config.options,
    }
    setMigrationPayload(payload)
    sessionStorage.setItem('boardupscale_active_migration', JSON.stringify(payload))
    setStep(4)
  }

  function handleComplete(runId: string) {
    sessionStorage.removeItem('boardupscale_active_migration')
    setCompletedRunId(runId)
    setStep(5)
  }

  function handleReset() {
    sessionStorage.removeItem('boardupscale_active_migration')
    setMigrationPayload(null)
    setConnectResult(null)
    setConnectionId(null)
    setSelectedKeys([])
    setSelectedProjects([])
    setSelectedMemberIds(undefined)
    setIsRestored(false)
    setStep(1)
  }

  const isWideStep = WIDE_STEPS.includes(step)

  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6">
      <div className={cn('mx-auto transition-all duration-300', isWideStep ? 'max-w-6xl' : 'max-w-2xl')}>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-200 dark:shadow-blue-900/40">
            <svg className="h-6 w-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.53 2c-.59 0-1.04.46-1.04 1.04v8.49H2.04C1.46 11.53 1 11.99 1 12.57c0 3.54 2.82 6.43 6.43 6.43h4.06v2.96c0 .59.46 1.04 1.04 1.04s1.04-.46 1.04-1.04v-2.96h4.06c3.61 0 6.37-2.89 6.37-6.43 0-.58-.46-1.04-1.04-1.04H13.62V3.04c0-.58-.5-1.04-1.04-1.04H11.53z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Migrate from Jira
          </h1>
          <p className="mt-2 text-muted-foreground text-sm sm:text-base">
            Import your projects, issues, sprints, and team members into Boardupscale.
          </p>
        </div>

        <Stepper currentStep={step} />

        {/* OAuth error banner */}
        {oauthError && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40 px-4 py-3.5 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>Atlassian connection failed:</strong> {oauthError}. Please try again.
            </span>
          </div>
        )}

        {/* Step content */}
        <div className={cn(
          'bg-card rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800',
          isWideStep ? 'p-6 sm:p-8' : 'p-6 sm:p-8',
        )}>
          {step === 1 && <ConnectStep onNext={handleConnect} />}

          {step === 2 && connectResult && (
            <PreviewStep
              runId={connectResult.runId}
              connectResult={connectResult}
              connectionId={connectionId ?? undefined}
              onNext={handlePreview}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <ConfigureStep
              onNext={handleConfigure}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && migrationPayload && (
            <ProgressStep
              payload={migrationPayload}
              onComplete={handleComplete}
              initialRunId={isRestored ? migrationPayload.runId : undefined}
              onReset={handleReset}
            />
          )}

          {step === 5 && completedRunId && <CompleteStep runId={completedRunId} />}
        </div>
      </div>
    </div>
  )
}
