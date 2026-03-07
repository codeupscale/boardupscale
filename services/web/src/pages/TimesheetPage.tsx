import { useState, useMemo } from 'react'
import { Download, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { LoadingPage } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabContent } from '@/components/ui/tabs'
import { useTimesheet, useTeamTimesheet } from '@/hooks/useReports'
import { useAuthStore } from '@/store/auth.store'

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

export function TimesheetPage() {
  const [activeView, setActiveView] = useState('my')
  const [weekOffset, setWeekOffset] = useState(0)
  const user = useAuthStore((s) => s.user)

  const { startDate, endDate } = useMemo(() => getWeekRange(weekOffset), [weekOffset])

  // For my timesheet, we use a dummy projectId to hit the endpoint (the backend
  // routes under /projects/:projectId/reports/timesheet). We pass the user's ID.
  // In practice, this endpoint is user-scoped, not strictly project-scoped.
  const timesheetQuery = useTimesheet(
    activeView === 'my' ? user?.id || '' : '',
    startDate,
    endDate,
  )

  // Team timesheet needs a project. For now, leave projectId blank — it shows
  // all work across all projects for the org.
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track time logged across issues
          </p>
        </div>
      </div>

      <Tabs tabs={VIEW_TABS} activeTab={activeView} onChange={setActiveView} />

      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setWeekOffset((w) => w - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-gray-700 min-w-44 text-center">
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

      <TabContent>
        {activeView === 'my' && (
          <MyTimesheetView
            data={timesheetQuery.data}
            isLoading={timesheetQuery.isLoading}
            startDate={startDate}
            endDate={endDate}
          />
        )}
        {activeView === 'team' && (
          <TeamTimesheetView
            data={teamTimesheetQuery.data}
            isLoading={teamTimesheetQuery.isLoading}
            startDate={startDate}
            endDate={endDate}
          />
        )}
      </TabContent>
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

  // Build issue rows: for each unique issue across all days, sum minutes per day
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            My Time ({formatMinutes(data.totalMinutes)})
          </h3>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 min-w-48">
                  Issue
                </th>
                {dates.map((d: string) => (
                  <th
                    key={d}
                    className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 min-w-20"
                  >
                    {formatDayHeader(d)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-700 min-w-20 bg-gray-100">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {issueRows.map((row) => {
                const rowTotal = row.dailyMinutes.reduce(
                  (s: number, m: number) => s + m,
                  0,
                )
                return (
                  <tr key={row.key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-gray-900">
                        {row.key}
                      </div>
                      <div className="text-xs text-gray-500 truncate max-w-56">
                        {row.title}
                      </div>
                    </td>
                    {row.dailyMinutes.map((m: number, i: number) => (
                      <td
                        key={i}
                        className={`px-3 py-2.5 text-center text-sm ${
                          m > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'
                        }`}
                      >
                        {formatMinutes(m)}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-900 bg-gray-50">
                      {formatMinutes(rowTotal)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">
                  Daily Total
                </td>
                {dailyTotals.map((m: number, i: number) => (
                  <td
                    key={i}
                    className="px-3 py-2.5 text-center text-sm font-semibold text-gray-700"
                  >
                    {formatMinutes(m)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center text-sm font-bold text-gray-900 bg-gray-100">
                  {formatMinutes(data.totalMinutes)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Team Time ({formatMinutes(data.totalMinutes)})
          </h3>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 min-w-40">
                  Team Member
                </th>
                {dates.map((d: string) => (
                  <th
                    key={d}
                    className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 min-w-20"
                  >
                    {formatDayHeader(d)}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-700 min-w-20 bg-gray-100">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member: any) => (
                <tr
                  key={member.userId}
                  className="border-b border-gray-50 hover:bg-gray-50"
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
                        <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-700">
                          {member.displayName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {member.displayName}
                      </span>
                    </div>
                  </td>
                  {(member.dailyMinutes || []).map((m: number, i: number) => (
                    <td
                      key={i}
                      className={`px-3 py-2.5 text-center text-sm ${
                        m > 0 ? 'text-gray-900 font-medium' : 'text-gray-300'
                      }`}
                    >
                      {formatMinutes(m)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-center text-sm font-semibold text-gray-900 bg-gray-50">
                    {formatMinutes(member.totalMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td className="px-4 py-2.5 text-sm font-semibold text-gray-700">
                  Daily Total
                </td>
                {(data.dailyTotals || []).map((m: number, i: number) => (
                  <td
                    key={i}
                    className="px-3 py-2.5 text-center text-sm font-semibold text-gray-700"
                  >
                    {formatMinutes(m)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center text-sm font-bold text-gray-900 bg-gray-100">
                  {formatMinutes(data.totalMinutes)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
