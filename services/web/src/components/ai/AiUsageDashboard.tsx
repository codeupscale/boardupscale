import { useState, useMemo } from 'react'
import { BarChart3, Users, Zap, TrendingUp } from 'lucide-react'
import { useAiUsageStats, useAiStatus } from '@/hooks/useAi'
import { cn } from '@/lib/utils'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

export function AiUsageDashboard() {
  const [daysRange, setDaysRange] = useState(30)
  const from = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - daysRange)
    return d.toISOString().split('T')[0]
  }, [daysRange])

  const { data: stats, isLoading } = useAiUsageStats(from)
  const { data: status } = useAiStatus()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No AI usage data available.</p>
      </div>
    )
  }

  const percentUsed = status?.usage?.percentUsed || 0
  const tier = status?.usage?.tier || 'normal'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">AI Usage</h3>
        <Select value={String(daysRange)} onValueChange={(v) => setDaysRange(Number(v))}>
          <SelectTrigger className="w-[140px] text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Zap className="h-4 w-4" />}
          label="Total Tokens"
          value={formatNumber(stats.total?.tokens || 0)}
          color="blue"
        />
        <StatCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Total Requests"
          value={formatNumber(stats.total?.requests || 0)}
          color="green"
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Tokens/Request"
          value={stats.total?.requests ? formatNumber(Math.round(stats.total.tokens / stats.total.requests)) : '0'}
          color="purple"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Active Users"
          value={String(stats.byUser?.length || 0)}
          color="amber"
        />
      </div>

      {/* Today's usage bar */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-foreground/80">Today's Usage</span>
          <span className="text-xs text-muted-foreground">{status?.usage?.tokensUsedToday?.toLocaleString() || 0} / {stats.dailyLimit?.toLocaleString()} tokens</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5">
          <div
            className={cn(
              'h-2.5 rounded-full transition-all',
              tier === 'exhausted' ? 'bg-red-500' : tier === 'warning' ? 'bg-amber-500' : 'bg-primary',
            )}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>
      </div>

      {/* Usage by feature */}
      {stats.byFeature && stats.byFeature.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground/80 mb-3">By Feature</h4>
          <div className="space-y-2">
            {stats.byFeature.map((f) => (
              <div key={f.feature} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground capitalize">{f.feature.replace(/-/g, ' ')}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{formatNumber(f.tokens)} tokens</span>
                  <span className="text-xs">{f.requests} req</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage by user */}
      {stats.byUser && stats.byUser.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground/80 mb-3">By User</h4>
          <div className="space-y-2">
            {stats.byUser.sort((a, b) => b.tokens - a.tokens).slice(0, 10).map((u) => (
              <div key={u.userId} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{u.displayName || 'Unknown'}</span>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>{formatNumber(u.tokens)} tokens</span>
                  <span className="text-xs">{u.requests} req</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily trend */}
      {stats.byDay && stats.byDay.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="text-sm font-medium text-foreground/80 mb-3">Daily Trend</h4>
          <div className="flex items-end gap-1 h-24">
            {stats.byDay.map((d) => {
              const maxTokens = Math.max(...stats.byDay.map((x) => x.tokens), 1)
              const heightPct = (d.tokens / maxTokens) * 100
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${formatNumber(d.tokens)} tokens`}>
                  <div
                    className="w-full bg-primary rounded-t min-h-[2px] transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{stats.byDay[0]?.date}</span>
            <span>{stats.byDay[stats.byDay.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-primary/10 text-primary',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    purple: 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className={cn('inline-flex p-1.5 rounded-md mb-2', colorMap[color])}>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
