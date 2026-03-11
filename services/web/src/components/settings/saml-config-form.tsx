import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Shield, Trash2, ExternalLink, Info, Copy, CheckCircle } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/store/ui.store'

const samlSchema = z.object({
  entryPoint: z.string().url('Must be a valid URL'),
  issuer: z.string().min(1, 'Entity ID / Issuer is required'),
  certificate: z.string().min(1, 'X.509 certificate is required'),
  callbackUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type SamlFormValues = z.infer<typeof samlSchema>

function useSamlConfig() {
  return useQuery({
    queryKey: ['saml-config'],
    queryFn: async () => {
      const { data } = await api.get('/organizations/me/saml-config')
      return data.data as {
        entryPoint: string
        issuer: string
        certificate: string
        callbackUrl?: string
      } | null
    },
  })
}

function useSaveSamlConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SamlFormValues) => {
      const { data } = await api.put('/organizations/me/saml-config', payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saml-config'] })
      toast('SAML SSO configuration saved successfully')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to save SAML configuration', 'error')
    },
  })
}

function useDeleteSamlConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.delete('/organizations/me/saml-config')
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['saml-config'] })
      toast('SAML SSO configuration removed')
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || 'Failed to remove SAML configuration', 'error')
    },
  })
}

export function SamlConfigForm() {
  const { data: config, isLoading } = useSamlConfig()
  const saveConfig = useSaveSamlConfig()
  const deleteConfig = useDeleteSamlConfig()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const isConfigured = !!(config?.entryPoint && config?.issuer && config?.certificate)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SamlFormValues>({
    resolver: zodResolver(samlSchema),
    values: {
      entryPoint: config?.entryPoint || '',
      issuer: config?.issuer || '',
      certificate: config?.certificate || '',
      callbackUrl: config?.callbackUrl || '',
    },
  })

  const onSubmit = (data: SamlFormValues) => {
    saveConfig.mutate(data)
  }

  const handleDelete = () => {
    deleteConfig.mutate(undefined, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        reset({ entryPoint: '', issuer: '', certificate: '', callbackUrl: '' })
      },
    })
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  // SP metadata values to show the admin
  const spCallbackUrl = `${window.location.origin}/api/auth/saml/callback`
  const spMetadataUrl = `${window.location.origin}/api/auth/saml/metadata`

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3" />
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-200 rounded" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-600" />
          SAML Single Sign-On (SSO)
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Configure SAML 2.0 SSO to allow members to sign in using your organization's identity provider
          (Okta, Azure AD, OneLogin, etc.).
        </p>
      </div>

      {/* Status indicator */}
      <div
        className={`flex items-center gap-3 p-4 rounded-lg border ${
          isConfigured
            ? 'bg-green-50 border-green-200'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        {isConfigured ? (
          <CheckCircle className="h-5 w-5 text-green-600" />
        ) : (
          <Info className="h-5 w-5 text-gray-400" />
        )}
        <div>
          <p
            className={`text-sm font-medium ${
              isConfigured ? 'text-green-700' : 'text-gray-700'
            }`}
          >
            {isConfigured ? 'SAML SSO is configured' : 'SAML SSO is not configured'}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isConfigured
              ? 'Members can sign in using your identity provider.'
              : 'Set up the fields below to enable SSO for your organization.'}
          </p>
        </div>
      </div>

      {/* SP Info for IdP setup */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
        <p className="text-sm font-medium text-blue-800">
          Service Provider (SP) information for your Identity Provider:
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-600 font-medium">ACS (Callback) URL</p>
              <p className="text-xs text-blue-900 font-mono truncate">{spCallbackUrl}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(spCallbackUrl, 'acs')}
              className="text-blue-600 hover:text-blue-800 p-1"
              title="Copy"
            >
              {copiedField === 'acs' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-blue-600 font-medium">SP Metadata URL</p>
              <p className="text-xs text-blue-900 font-mono truncate">{spMetadataUrl}</p>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(spMetadataUrl, 'metadata')}
              className="text-blue-600 hover:text-blue-800 p-1"
              title="Copy"
            >
              {copiedField === 'metadata' ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Configuration form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Identity Provider SSO URL"
          placeholder="https://your-idp.example.com/sso/saml"
          helperText="The URL where SAML authentication requests are sent (e.g., Okta SSO URL, Azure AD login URL)"
          error={errors.entryPoint?.message}
          {...register('entryPoint')}
        />

        <Input
          label="Entity ID / Issuer"
          placeholder="https://your-idp.example.com/entity-id"
          helperText="The unique identifier for your service provider, shared between SP and IdP"
          error={errors.issuer?.message}
          {...register('issuer')}
        />

        <Textarea
          label="IdP X.509 Certificate"
          placeholder={"-----BEGIN CERTIFICATE-----\nMIIDp...\n-----END CERTIFICATE-----"}
          helperText="The public certificate from your IdP used to verify SAML response signatures (PEM format)"
          rows={6}
          className="font-mono text-xs"
          error={errors.certificate?.message}
          {...register('certificate')}
        />

        <Input
          label="Callback URL (Optional)"
          placeholder={spCallbackUrl}
          helperText="Override the default ACS URL. Leave blank to use the default."
          error={errors.callbackUrl?.message}
          {...register('callbackUrl')}
        />

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" isLoading={saveConfig.isPending} disabled={!isDirty}>
            {isConfigured ? 'Update Configuration' : 'Enable SAML SSO'}
          </Button>

          {isConfigured && !showDeleteConfirm && (
            <Button
              type="button"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Remove
            </Button>
          )}
        </div>
      </form>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
          <p className="text-sm text-red-700 font-medium">
            Are you sure you want to remove SAML SSO? Members will no longer be able to sign in via SSO.
          </p>
          <div className="flex gap-2">
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              isLoading={deleteConfig.isPending}
            >
              Confirm Remove
            </Button>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
