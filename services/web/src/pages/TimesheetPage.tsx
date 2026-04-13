import { useState, useMemo } from 'react'
import { Download, ChevronLeft, ChevronRight, Clock, Users, Timer, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/common/page-header'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useTimesheet, useTeamTimesheet } from '@/hooks/useReports'
import { useAuthStore } from '@/store/auth.store'
import { cn } from '@/lib/utils'

const VIEW_TABS = [
  { id: 'my', label: 'My Timesheet', icon: <Clock className="h-4 w-4" /> },
  { id: 'team', label: 'Team Timesheet', icon: <Users className="h-4 w-4" /> },
]

function getWeekRange(offset: number): { startDate: string; endDate: string } {
  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + mondayOffset + offset * 7)
  monday.setHours(0, 0, 0, 0)

  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  return {
    startDate: monday.toISOString().split('T')[0],
    endDate: sunday.toISOString().split('T')[0],
  }
}

function formatMinutes(minutes: number): string {
  if (!minutes) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`
}

function generateCsv(
  dates: string[],
  rows: Array<{ label: string; dailyMinutes: number[]; totalMinutes: number }>,
): string {
  const headers = ['', ...dates.map(formatDayHeader), 'Total']
  const lines = [headers.join(',')]

  for (const row of rows) {
    const values = [
      `"${row.label.replace(/"/g, '""')}"`,
      ...row.dailyMinutes.map((m) => String(m)),
      String(row.totalMinutes),
    ]
    lines.push(values.join(','))
  }

  return lines.join('\n')
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  color: string
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
      <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0', color)}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">
          {value}
        </p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export function TimesheetPage() {
  const [activeView, setActiveView] = useState('my')
  const [weekOffset, setWeekOffset] = useState(0)
  const user = useAuthStore((s) => s.user)

  const { startDate, endDate } = useMemo(() => getWeekRange(weekOffset), [weekOffset])

  const timesheetQuery = useTimesheet(
    activeView === 'my' ? user?.id || '' : '',
    startDate,
    endDate,
  )

  const teamTimesheetQuery = useTeamTimesheet(
    activeView === 'team' ? 'all' : '',
    startDate,
    endDate,
  )

  const weekLabel = `${new Date(startDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} - ${new Date(endDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`

  // Compute stats from current data
  const currentData = activeView === 'my' ? timesheetQuery.data : teamTimesheetQuery.data
  const totalMinutes = currentData?.totalMinutes ?? 0
  const issueCount = activeView === 'my' && timesheetQuery.data?.days
    ? new Set(
        timesheetQuery.data.days.flatMap((d: any) =>
          (d.entries || []).map((e: any) => e.issueKey),
        ),
      ).size
    : activeView === 'team' && teamTimesheetQuery.data?.members
      ? teamTimesheetQuery.data.members.length
      : 0

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Timesheet"
        subtitle="Track time logged across issues"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={<Timer className="h-5 w-5 text-blue-600" />}
            label="Total This Week"
            value={formatMinutes(totalMinutes) === '-' ? '0h' : formatMinutes(totalMinutes)}
            color="bg-blue-50 dark:bg-blue-900/20"
          />
          <StatCard
            icon={<ListChecks className="h-5 w-5 text-emerald-600" />}
            label={activeView === 'my' ? 'Issues Worked' : 'Team Members'}
            value={String(issueCount)}
            color="bg-emerald-50 dark:bg-emerald-900/20"
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-purple-600" />}
            label="Daily Average"
            value={totalMinutes > 0 ? formatMinutes(Math.round(totalMinutes / 5)) : '0h'}
            color="bg-purple-50 dark:bg-purple-900/20"
          />
        </div>

        <Tabs value={activeView} onValueChange={setActiveView}>
          <TabsList>
            {VIEW_TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.icon}
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Week Navigation */}
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setWeekOffset((w) => w - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium text-foreground min-w-44 text-center">
              {weekLabel}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setWeekOffset((w) => w + 1)}
              disabled={weekOffset >= 0}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {weekOffset !== 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWeekOffset(0)}
              >
                This Week
              </Button>
            )}
          </div>

          <TabsContent value="my">
            <MyTimesheetView
              data={timesheetQuery.data}
              isLoading={timesheetQuery.isLoading}
              startDate={startDate}
              endDate={endDate}
            />
          </TabsContent>
          <TabsContent value="team">
            <TeamTimesheetView
              data={teamTimesheetQuery.data}
              isLoading={teamTimesheetQuery.isLoading}
              startDate={startDate}
              endDate={endDate}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

interface MyTimesheetViewProps {
  data: any
  isLoading: boolean
  startDate: string
  endDate: string
}

function MyTimesheetView({
  data,
  isLoading,
  startDate,
  endDate,
}: MyTimesheetViewProps) {
  if (isLoading) return <LoadingPage />
  if (!data || !data.days || data.days.length === 0) {
    return (
      <EmptyState
        title="No time logged"
        description="Log time on issues to see your timesheet."
      />
    )
  }

  const dates = data.days.map((d: any) => d.date)

  const issueMap = new Map<
    string,
    { key: string; title: string; project: string; dailyMinutes: number[] }
  >()

  for (let dayIdx = 0; dayIdx < data.days.length; dayIdx++) {
    const day = data.days[dayIdx]
    for (const entry of day.entries) {
      if (!issueMap.has(entry.issueKey)) {
        issueMap.set(entry.issueKey, {
          key: entry.issueKey,
          title: entry.issueTitle,
          project: entry.projectName,
          dailyMinutes: new Array(data.days.length).fill(0),
        })
      }
      issueMap.get(entry.issueKey)!.dailyMinutes[dayIdx] += entry.timeSpent
    }
  }

  const issueRows = Array.from(issueMap.values())
  const dailyTotals = dates.map((_: string, i: number) =>
    data.days[i].totalMinutes,
  )

  const handleExport = () => {
    const csvRows = issueRows.map((r) => ({
      label: `${r.key} - ${r.title}`,
      dailyMinutes: r.dailyMinutes,
      totalMinutes: r.dailyMinutes.reduce((s: number, m: number) => s + m, 0),
    }))
    const csv = generateCsv(dates, csvRows)
    downloadCsv(csv, `timesheet-${startDate}-to-${endDate}.csv`)
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          My Time ({formatMinutes(data.totalMinutes)})
        </h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-48">
                Issue
              </th>
              {dates.map((d: string) => (
                <th
                  key={d}
                  className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-20"
                >
                  {formatDayHeader(d)}
                </th>
              ))}
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-20 bg-gray-100 dark:bg-gray-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {issueRows.map((row) => {
              const rowTotal = row.dailyMinutes.reduce(
                (s: number, m: number) => s + m,
                0,
              )
              return (
                <tr key={row.key} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-sm font-medium text-foreground">
                      {row.key}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-56">
                      {row.title}
                    </div>
                  </td>
                  {row.dailyMinutes.map((m: number, i: number) => (
                    <td
                      key={i}
                      className={cn(
                        'px-3 py-2.5 text-center text-sm',
                        m > 0 ? 'text-foreground font-medium' : 'text-gray-300 dark:text-gray-600',
                      )}
                    >
                      {formatMinutes(m)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center text-sm font-semibold text-foreground bg-muted/50">
                    {formatMinutes(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted border-t border-border">
              <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                Daily Total
              </td>
              {dailyTotals.map((m: number, i: number) => (
                <td
                  key={i}
                  className="px-3 py-2.5 text-center text-sm font-semibold text-foreground"
                >
                  {formatMinutes(m)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-center text-sm font-bold text-foreground bg-gray-100 dark:bg-gray-700">
                {formatMinutes(data.totalMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

interface TeamTimesheetViewProps {
  data: any
  isLoading: boolean
  startDate: string
  endDate: string
}

function TeamTimesheetView({
  data,
  isLoading,
  startDate,
  endDate,
}: TeamTimesheetViewProps) {
  if (isLoading) return <LoadingPage />
  if (!data || !data.members || data.members.length === 0) {
    return (
      <EmptyState
        title="No team time logged"
        description="Team members need to log time on issues to see the team timesheet."
      />
    )
  }

  const dates = data.dates || []
  const members = data.members || []

  const handleExport = () => {
    const csvRows = members.map((m: any) => ({
      label: m.displayName,
      dailyMinutes: m.dailyMinutes,
      totalMinutes: m.totalMinutes,
    }))
    const csv = generateCsv(dates, csvRows)
    downloadCsv(csv, `team-timesheet-${startDate}-to-${endDate}.csv`)
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">
          Team Time ({formatMinutes(data.totalMinutes)})
        </h3>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-40">
                Team Member
              </th>
              {dates.map((d: string) => (
                <th
                  key={d}
                  className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-20"
                >
                  {formatDayHeader(d)}
                </th>
              ))}
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider min-w-20 bg-gray-100 dark:bg-gray-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {members.map((member: any) => (
              <tr
                key={member.userId}
                className="hover:bg-accent/50 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {member.avatarUrl ? (
                      <img
                        src={member.avatarUrl}
                        alt=""
                        className="h-6 w-6 rounded-full"
                      />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-xs font-medium text-blue-600 dark:text-blue-400">
                        {member.displayName?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                    )}
                    <span className="text-sm font-medium text-foreground">
                      {member.displayName}
                    </span>
                  </div>
                </td>
                {(member.dailyMinutes || []).map((m: number, i: number) => (
                  <td
                    key={i}
                    className={cn(
                      'px-3 py-2.5 text-center text-sm',
                      m > 0 ? 'text-foreground font-medium' : 'text-gray-300 dark:text-gray-600',
                    )}
                  >
                    {formatMinutes(m)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center text-sm font-semibold text-foreground bg-muted/50">
                  {formatMinutes(member.totalMinutes)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted border-t border-border">
              <td className="px-4 py-2.5 text-sm font-semibold text-foreground">
                Daily Total
              </td>
              {(data.dailyTotals || []).map((m: number, i: number) => (
                <td
                  key={i}
                  className="px-3 py-2.5 text-center text-sm font-semibold text-foreground"
                >
                  {formatMinutes(m)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-center text-sm font-bold text-foreground bg-gray-100 dark:bg-gray-700">
                {formatMinutes(data.totalMinutes)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
