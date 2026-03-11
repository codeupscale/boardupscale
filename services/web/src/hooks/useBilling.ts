import { useQuery, useMutation } from '@tanstack/react-query'
import api from '@/lib/api'

export interface BillingPlan {
  id: string
  name: string
  slug: string
  priceMonthly: number
  priceYearly: number
  maxUsers: number
  maxStorageGb: number
  features: Record<string, boolean>
  isActive: boolean
}

export interface Subscription {
  id: string
  organizationId: string
  plan: BillingPlan
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export interface Usage {
  userCount: number
  maxUsers: number
  storageUsedGb: number
  maxStorageGb: number
  aiTokensToday: number
  aiTokensLimit: number
}

export function usePlans() {
  return useQuery({
    queryKey: ['billing-plans'],
    queryFn: async () => {
      const { data } = await api.get('/billing/plans')
      return data.data as BillingPlan[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSubscription() {
  return useQuery({
    queryKey: ['billing-subscription'],
    queryFn: async () => {
      const { data } = await api.get('/billing/subscription')
      return data.data as Subscription | null
    },
  })
}

export function useUsage() {
  return useQuery({
    queryKey: ['billing-usage'],
    queryFn: async () => {
      const { data } = await api.get('/billing/usage')
      return data.data as Usage
    },
  })
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (params: { planSlug: string; billingCycle: 'monthly' | 'yearly' }) => {
      const { data } = await api.post('/billing/checkout', params)
      return data.data as { url: string }
    },
  })
}

export function useBillingPortal() {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/billing/portal')
      return data.data as { url: string }
    },
  })
}
