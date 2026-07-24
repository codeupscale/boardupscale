import type { ReactNode } from 'react'
import { Users, UserPlus, Mail } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DashboardPanelCard } from '@/components/dashboard/dashboard-panel-card'
import {
  MEMBER_ROLE_COLORS,
  MEMBER_ROLE_LABELS,
} from '@/components/dashboard/dashboard-chart-theme'
import type { MemberSnapshot } from '@/hooks/useOrgDashboard'
import { cn } from '@/lib/utils'

interface MemberManagementSnapshotProps {
  data: MemberSnapshot
}

function formatTrend(delta: number): {
  text: string
  className: string
  stroke: string
  direction: 'up' | 'down' | 'flat'
} {
  if (delta === 0) {
    return {
      text: 'No change this month',
      className: 'text-muted-foreground',
      stroke: 'rgba(148, 163, 184, 0.85)',
      direction: 'flat',
    }
  }
  const abs = Math.abs(delta)
  if (delta > 0) {
    return {
      text: `↑ ${abs} this month`,
      className: 'text-emerald-400',
      stroke: '#34d399',
      direction: 'up',
    }
  }
  return {
    text: `↓ ${abs} this month`,
    className: 'text-amber-400',
    stroke: '#fbbf24',
    direction: 'down',
  }
}

/** Mini sparkline — thicker stroke so the trend is readable on dark cards. */
function TrendSparkline({
  direction,
  stroke,
}: {
  direction: 'up' | 'down' | 'flat'
  stroke: string
}) {
  const path =
    direction === 'up'
      ? 'M2 18 L8 14 L14 15 L22 6 L28 8'
      : direction === 'down'
        ? 'M2 8 L8 10 L14 9 L22 18 L28 14'
        : 'M2 12 L10 12 L18 11 L28 12'

  return (
    <svg
      viewBox="0 0 30 20"
      className="w-full h-5 mt-1.5"
      aria-hidden
      preserveAspectRatio="none"
    >
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function MemberManagementSnapshot({
  data,
}: MemberManagementSnapshotProps) {
  const { t } = useTranslation()
  const membersTrend = formatTrend(data.membersAddedThisMonth)
  const pendingTrend = formatTrend(data.pendingInvitesTrendDelta)
  const totalForBar = data.roleDistribution.reduce((n, s) => n + s.count, 0)

  return (
    <DashboardPanelCard
      title={t('orgDashboard.memberSnapshot.title')}
      footerHref="/settings/team"
      footerLabel={t('orgDashboard.memberSnapshot.manageMembers')}
    >
      <div className="flex flex-col gap-4 h-full min-h-0">
        <div className="grid grid-cols-3 gap-2">
          <MetricTile
            icon={<Users className="h-3.5 w-3.5" />}
            label={t('orgDashboard.memberSnapshot.totalMembers')}
            value={data.totalMembers}
            trend={membersTrend}
            iconClassName="bg-emerald-500/15 text-emerald-400"
          />
          <MetricTile
            icon={<UserPlus className="h-3.5 w-3.5" />}
            label={t('orgDashboard.memberSnapshot.pendingInvites')}
            value={data.pendingInvites}
            trend={pendingTrend}
            iconClassName="bg-amber-500/15 text-amber-400"
          />
          <MetricTile
            icon={<Mail className="h-3.5 w-3.5" />}
            label={t('orgDashboard.memberSnapshot.activeInvitations')}
            value={data.activeInvitations}
            hint={
              data.activeInvitationsHint ??
              (data.activeInvitations === 0
                ? t('orgDashboard.memberSnapshot.noActiveInvites')
                : null)
            }
            iconClassName="bg-sky-500/15 text-sky-400"
          />
        </div>

        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('orgDashboard.memberSnapshot.roleDistribution')}
            </p>
            <p className="text-[10px] text-muted-foreground/80 truncate">
              {t('orgDashboard.memberSnapshot.countingHint')}
            </p>
          </div>

          {totalForBar === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">
              {t('orgDashboard.memberSnapshot.emptyRoles')}
            </p>
          ) : (
            <>
              <div
                className="flex h-4 w-full overflow-hidden rounded-full bg-muted/50 ring-1 ring-border/50"
                role="img"
                aria-label={t('orgDashboard.memberSnapshot.roleDistribution')}
              >
                {data.roleDistribution.map((seg) =>
                  seg.count > 0 ? (
                    <div
                      key={seg.key}
                      className="h-full transition-[width] duration-300 first:rounded-l-full last:rounded-r-full"
                      style={{
                        width: `${(seg.count / totalForBar) * 100}%`,
                        backgroundColor: MEMBER_ROLE_COLORS[seg.key],
                      }}
                      title={`${MEMBER_ROLE_LABELS[seg.key]}: ${seg.count}`}
                    />
                  ) : null,
                )}
              </div>

              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
                {data.roleDistribution.map((seg) => (
                  <li
                    key={seg.key}
                    className="flex items-center gap-2 min-w-0 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: MEMBER_ROLE_COLORS[seg.key] }}
                      aria-hidden
                    />
                    <span className="truncate text-muted-foreground">
                      {t(`orgDashboard.memberSnapshot.roles.${seg.key}`, {
                        defaultValue: MEMBER_ROLE_LABELS[seg.key],
                      })}
                    </span>
                    <span className="ml-auto tabular-nums text-foreground/90 font-medium">
                      {seg.count}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </DashboardPanelCard>
  )
}

function MetricTile({
  icon,
  label,
  value,
  trend,
  hint,
  iconClassName,
}: {
  icon: ReactNode
  label: string
  value: number
  trend?: ReturnType<typeof formatTrend>
  hint?: string | null
  iconClassName?: string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2 min-w-0 flex flex-col">
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={cn(
            'inline-flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0',
            iconClassName,
          )}
        >
          {icon}
        </span>
        <span
          className="text-[10px] uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2"
          title={label}
        >
          {label}
        </span>
      </div>
      <p className="text-lg font-semibold tabular-nums leading-none">{value}</p>
      {trend ? (
        <>
          <p className={cn('text-[10px] mt-1 leading-tight', trend.className)}>
            {trend.text}
          </p>
          <TrendSparkline direction={trend.direction} stroke={trend.stroke} />
        </>
      ) : hint ? (
        <p className="text-[10px] mt-1 text-muted-foreground line-clamp-2" title={hint}>
          {hint}
        </p>
      ) : (
        <p className="text-[10px] mt-1 text-muted-foreground/60">—</p>
      )}
    </div>
  )
}
