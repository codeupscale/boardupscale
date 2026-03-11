import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Plus,
  Trash2,
  Edit2,
  Send,
  RefreshCw,
  Globe,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  Eye,
  EyeOff,
} from 'lucide-react'
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookDeliveries,
  useRetryDelivery,
} from '@/hooks/useWebhooks'
import { useProject } from '@/hooks/useProjects'
import { WEBHOOK_EVENT_TYPES, Webhook, WebhookDelivery } from '@/types'
import { PageHeader } from '@/components/common/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogHeader, DialogTitle, DialogContent } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { cn } from '@/lib/utils'

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatDate(date: string): string {
  return new Date(date).toLocaleString()
}

function DeliveryStatusBadge({ status }: { status: string }) {
  if (status === 'success') {
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="h-3 w-3" />
        Success
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <Badge variant="danger" className="gap-1">
        <XCircle className="h-3 w-3" />
        Failed
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className="gap-1">
      <Clock className="h-3 w-3" />
      Pending
    </Badge>
  )
}

// ─── Delivery History Panel ──────────────────────────────────────────────────

function DeliveryHistory({
  webhook,
  onBack,
}: {
  webhook: Webhook
  onBack: () => void
}) {
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data, isLoading } = useWebhookDeliveries(webhook.id, page)
  const retryDelivery = useRetryDelivery()

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-base font-semibold text-gray-900">Delivery History</h2>
          <p className="text-sm text-gray-500">{webhook.name}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading deliveries...</div>
      ) : !data?.items?.length ? (
        <EmptyState
          icon={<Send className="h-8 w-8" />}
          title="No deliveries yet"
          description="Webhook deliveries will appear here once events are triggered."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {data.items.map((delivery: WebhookDelivery) => (
            <div key={delivery.id}>
              <button
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                onClick={() =>
                  setExpandedId(expandedId === delivery.id ? null : delivery.id)
                }
              >
                <DeliveryStatusBadge status={delivery.status} />
                <span className="text-xs font-mono text-gray-600 flex-shrink-0">
                  {delivery.eventType}
                </span>
                <span className="flex-1 text-xs text-gray-500 truncate">
                  {delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : 'No response'}
                </span>
                <span className="text-xs text-gray-500">{formatDuration(delivery.durationMs)}</span>
                <span className="text-xs text-gray-500">{formatDate(delivery.createdAt)}</span>
                {delivery.status === 'failed' && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      retryDelivery.mutate({
                        deliveryId: delivery.id,
                        webhookId: webhook.id,
                      })
                    }}
                    title="Retry"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </button>
              {expandedId === delivery.id && (
                <div className="px-4 pb-3 space-y-2">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Request Payload</p>
                    <pre className="text-xs text-gray-700 overflow-auto max-h-40">
                      {JSON.stringify(delivery.payload, null, 2)}
                    </pre>
                  </div>
                  {delivery.responseBody && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Response Body</p>
                      <pre className="text-xs text-gray-700 overflow-auto max-h-40">
                        {delivery.responseBody}
                      </pre>
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Attempt: {delivery.attempt}</span>
                    {delivery.nextRetryAt && (
                      <span>Next retry: {formatDate(delivery.nextRetryAt)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {data.meta.page} of {data.meta.totalPages} ({data.meta.total} total)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main WebhooksPage ──────────────────────────────────────────────────────

export function WebhooksPage() {
  const { key: projectKey } = useParams<{ key: string }>()
  const { data: project } = useProject(projectKey!)
  const { data: webhooks, isLoading } = useWebhooks(projectKey!)
  const createWebhook = useCreateWebhook()
  const updateWebhook = useUpdateWebhook()
  const deleteWebhook = useDeleteWebhook()
  const testWebhook = useTestWebhook()

  const [showForm, setShowForm] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null)
  const [deliveryTarget, setDeliveryTarget] = useState<Webhook | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])

  const resetForm = () => {
    setName('')
    setUrl('')
    setSecret('')
    setShowSecret(false)
    setSelectedEvents([])
    setEditingWebhook(null)
  }

  const openCreate = () => {
    resetForm()
    setShowForm(true)
  }

  const openEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook)
    setName(webhook.name)
    setUrl(webhook.url)
    setSecret(webhook.secret || '')
    setSelectedEvents([...webhook.events])
    setShowForm(true)
  }

  const handleSubmit = () => {
    if (editingWebhook) {
      updateWebhook.mutate(
        {
          id: editingWebhook.id,
          projectId: projectKey!,
          name,
          url,
          secret: secret || undefined,
          events: selectedEvents,
        },
        {
          onSuccess: () => {
            setShowForm(false)
            resetForm()
          },
        },
      )
    } else {
      createWebhook.mutate(
        {
          projectId: projectKey!,
          name,
          url,
          secret: secret || undefined,
          events: selectedEvents,
        },
        {
          onSuccess: () => {
            setShowForm(false)
            resetForm()
          },
        },
      )
    }
  }

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    )
  }

  const selectAllEvents = () => {
    setSelectedEvents([...WEBHOOK_EVENT_TYPES])
  }

  const deselectAllEvents = () => {
    setSelectedEvents([])
  }

  const handleToggleActive = (webhook: Webhook) => {
    updateWebhook.mutate({
      id: webhook.id,
      projectId: projectKey!,
      isActive: !webhook.isActive,
    })
  }

  if (isLoading) return <LoadingPage />

  // Show delivery history for a specific webhook
  if (deliveryTarget) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Webhooks"
          breadcrumbs={[
            { label: 'Projects', href: '/projects' },
            { label: project?.name || '...', href: `/projects/${projectKey}/board` },
            { label: 'Settings', href: `/projects/${projectKey}/settings` },
            { label: 'Webhooks' },
          ]}
        />
        <div className="p-6 max-w-4xl">
          <DeliveryHistory
            webhook={deliveryTarget}
            onBack={() => setDeliveryTarget(null)}
          />
        </div>
      </div>
    )
  }

  // Event categories for grouped display
  const eventCategories = [
    {
      label: 'Issues',
      events: WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('issue.')),
    },
    {
      label: 'Comments',
      events: WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('comment.')),
    },
    {
      label: 'Sprints',
      events: WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('sprint.')),
    },
    {
      label: 'Projects',
      events: WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('project.')),
    },
    {
      label: 'Members',
      events: WEBHOOK_EVENT_TYPES.filter((e) => e.startsWith('member.')),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Webhooks"
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project?.name || '...', href: `/projects/${projectKey}/board` },
          { label: 'Settings', href: `/projects/${projectKey}/settings` },
          { label: 'Webhooks' },
        ]}
      />

      <div className="p-6 max-w-4xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Webhooks</h2>
            <p className="text-sm text-gray-500 mt-1">
              Receive HTTP callbacks when events happen in this project.
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Webhook
          </Button>
        </div>

        {!webhooks?.length ? (
          <EmptyState
            icon={<Globe className="h-10 w-10" />}
            title="No webhooks configured"
            description="Create a webhook to receive real-time notifications when events occur in this project."
            action={{ label: 'Add Webhook', onClick: openCreate }}
          />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="flex items-center gap-3 px-4 py-3 group"
              >
                <div
                  className={cn(
                    'h-2.5 w-2.5 rounded-full flex-shrink-0',
                    webhook.isActive ? 'bg-green-500' : 'bg-gray-300',
                  )}
                  title={webhook.isActive ? 'Active' : 'Inactive'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {webhook.name}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {webhook.events.length} event{webhook.events.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{webhook.url}</p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeliveryTarget(webhook)}
                    title="View deliveries"
                  >
                    <Clock className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => testWebhook.mutate(webhook.id)}
                    title="Send test"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleToggleActive(webhook)}
                    title={webhook.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {webhook.isActive ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(webhook)}
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => setDeleteTarget(webhook)}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog
        open={showForm}
        onClose={() => {
          setShowForm(false)
          resetForm()
        }}
        className="max-w-lg"
      >
        <DialogHeader
          onClose={() => {
            setShowForm(false)
            resetForm()
          }}
        >
          <DialogTitle>
            {editingWebhook ? 'Edit Webhook' : 'Create Webhook'}
          </DialogTitle>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <Input
            label="Name"
            placeholder="e.g. CI/CD Pipeline"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Payload URL"
            placeholder="https://example.com/webhook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="relative">
            <Input
              label="Secret (optional)"
              placeholder="Used for HMAC-SHA256 signature"
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-2 top-8 text-gray-400 hover:text-gray-600"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Events</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={selectAllEvents}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:underline"
                  onClick={deselectAllEvents}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {eventCategories.map((category) => (
                <div key={category.label}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    {category.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {category.events.map((event) => (
                      <button
                        key={event}
                        type="button"
                        onClick={() => toggleEvent(event)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                          selectedEvents.includes(event)
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                        )}
                      >
                        {event}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false)
                resetForm()
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!name || !url || selectedEvents.length === 0}
              isLoading={createWebhook.isPending || updateWebhook.isPending}
              onClick={handleSubmit}
            >
              {editingWebhook ? 'Save' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteWebhook.mutate(
              { id: deleteTarget.id, projectId: projectKey! },
              { onSuccess: () => setDeleteTarget(null) },
            )
          }
        }}
        title="Delete Webhook"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? All delivery history will be lost.`}
        confirmLabel="Delete Webhook"
        destructive
        isLoading={deleteWebhook.isPending}
      />
    </div>
  )
}
