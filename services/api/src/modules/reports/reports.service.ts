import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { User } from '../users/entities/user.entity';
import { Project } from '../projects/entities/project.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Sprint)
    private sprintRepository: Repository<Sprint>,
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(WorkLog)
    private workLogRepository: Repository<WorkLog>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
  ) {}

  /**
   * Sprint Burndown: For each day of the sprint, calculate remaining story points
   * (issues NOT in 'done' category).
   */
  async getSprintBurndown(
    projectId: string,
    sprintId: string,
    organizationId: string,
  ) {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    // Get all issues in this sprint
    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.sprint_id = :sprintId', { sprintId })
      .andWhere('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .getMany();

    const totalPoints = issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);

    // Determine date range
    const startDate = sprint.startDate
      ? new Date(sprint.startDate)
      : new Date(sprint.createdAt);
    const endDate = sprint.endDate
      ? new Date(sprint.endDate)
      : new Date();

    const today = new Date();
    const effectiveEnd = endDate > today ? today : endDate;

    // Generate date array
    const dates: string[] = [];
    const ideal: number[] = [];
    const actual: number[] = [];

    const totalDays = Math.max(
      1,
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
    );

    const daysBetween = Math.ceil(
      (effectiveEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];
      dates.push(dateStr);

      // Ideal burndown: linear from totalPoints to 0
      const idealRemaining =
        totalPoints - (totalPoints * d) / (totalDays - 1 || 1);
      ideal.push(Math.round(idealRemaining * 10) / 10);

      // Actual burndown: count remaining points for issues NOT done by that date
      if (d < daysBetween) {
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Issues completed (moved to done) by end of this day
        const completedPoints = issues
          .filter((issue) => {
            if (issue.status?.category !== 'done') return false;
            // Use updatedAt as proxy for when status changed
            return new Date(issue.updatedAt) <= endOfDay;
          })
          .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

        actual.push(totalPoints - completedPoints);
      }
    }

    return {
      sprintName: sprint.name,
      dates,
      ideal,
      actual,
      totalPoints,
    };
  }

  /**
   * Velocity: Last N completed sprints with committed vs completed story points.
   */
  async getVelocity(
    projectId: string,
    organizationId: string,
    sprintCount: number = 6,
  ) {
    const completedSprints = await this.sprintRepository
      .createQueryBuilder('sprint')
      .where('sprint.project_id = :projectId', { projectId })
      .andWhere('sprint.status = :status', { status: 'completed' })
      .orderBy('sprint.completed_at', 'DESC')
      .take(sprintCount)
      .getMany();

    // Reverse to get chronological order
    completedSprints.reverse();

    const sprints: Array<{
      name: string;
      committed: number;
      completed: number;
    }> = [];

    for (const sprint of completedSprints) {
      const issues = await this.issueRepository
        .createQueryBuilder('issue')
        .leftJoinAndSelect('issue.status', 'status')
        .where('issue.sprint_id = :sprintId', { sprintId: sprint.id })
        .andWhere('issue.project_id = :projectId', { projectId })
        .andWhere('issue.organization_id = :organizationId', {
          organizationId,
        })
        .andWhere('issue.deleted_at IS NULL')
        .getMany();

      const committed = issues.reduce(
        (sum, i) => sum + (i.storyPoints || 0),
        0,
      );
      const completed = issues
        .filter((i) => i.status?.category === 'done')
        .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

      sprints.push({
        name: sprint.name,
        committed,
        completed,
      });
    }

    const totalCompleted = sprints.reduce((sum, s) => sum + s.completed, 0);
    const averageVelocity =
      sprints.length > 0
        ? Math.round((totalCompleted / sprints.length) * 10) / 10
        : 0;

    return {
      sprints,
      averageVelocity,
    };
  }

  /**
   * Cumulative Flow: For each day, count issues per status category (todo/in_progress/done).
   */
  async getCumulativeFlow(
    projectId: string,
    organizationId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30 days

    // Get all issues for project (including their current status)
    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .getMany();

    const dates: string[] = [];
    const todo: number[] = [];
    const inProgress: number[] = [];
    const done: number[] = [];

    const totalDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);

      dates.push(dateStr);

      // Issues that existed by end of this day
      const existingIssues = issues.filter(
        (i) => new Date(i.createdAt) <= endOfDay,
      );

      // For simplicity, use current status category. In production, you'd track
      // status change history. Here we approximate: if updated before date, use
      // current status; otherwise categorize as todo.
      let todoCount = 0;
      let inProgressCount = 0;
      let doneCount = 0;

      for (const issue of existingIssues) {
        const category = issue.status?.category || 'todo';
        if (category === 'done' && new Date(issue.updatedAt) <= endOfDay) {
          doneCount++;
        } else if (
          category === 'in_progress' &&
          new Date(issue.updatedAt) <= endOfDay
        ) {
          inProgressCount++;
        } else {
          todoCount++;
        }
      }

      todo.push(todoCount);
      inProgress.push(inProgressCount);
      done.push(doneCount);
    }

    return {
      dates,
      todo,
      inProgress,
      done,
    };
  }

  /**
   * Issue Breakdown: Count by type, priority, and status.
   */
  async getIssueBreakdown(projectId: string, organizationId: string) {
    // By type
    const byType = await this.issueRepository
      .createQueryBuilder('issue')
      .select('issue.type', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .groupBy('issue.type')
      .getRawMany();

    // By priority
    const byPriority = await this.issueRepository
      .createQueryBuilder('issue')
      .select('issue.priority', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .groupBy('issue.priority')
      .getRawMany();

    // By status
    const byStatus = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoin('issue.status', 'status')
      .select('status.name', 'name')
      .addSelect('status.color', 'color')
      .addSelect('status.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .groupBy('status.name')
      .addGroupBy('status.color')
      .addGroupBy('status.category')
      .getRawMany();

    return {
      byType: byType.map((r) => ({ name: r.name, count: parseInt(r.count, 10) })),
      byPriority: byPriority.map((r) => ({ name: r.name, count: parseInt(r.count, 10) })),
      byStatus: byStatus.map((r) => ({
        name: r.name,
        color: r.color,
        category: r.category,
        count: parseInt(r.count, 10),
      })),
    };
  }

  /**
   * Assignee Workload: Per assignee - open issues count, total story points, time logged.
   */
  async getAssigneeWorkload(projectId: string, organizationId: string) {
    // Get open issues grouped by assignee
    const workloadRaw = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoin('issue.assignee', 'assignee')
      .leftJoin('issue.status', 'status')
      .select('assignee.id', 'assigneeId')
      .addSelect('assignee.display_name', 'displayName')
      .addSelect('assignee.avatar_url', 'avatarUrl')
      .addSelect('COUNT(*)', 'issueCount')
      .addSelect('COALESCE(SUM(issue.story_points), 0)', 'totalStoryPoints')
      .addSelect('COALESCE(SUM(issue.time_spent), 0)', 'totalTimeSpent')
      .addSelect(
        `SUM(CASE WHEN status.category != 'done' THEN 1 ELSE 0 END)`,
        'openIssues',
      )
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere('issue.assignee_id IS NOT NULL')
      .groupBy('assignee.id')
      .addGroupBy('assignee.display_name')
      .addGroupBy('assignee.avatar_url')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();

    const assignees = workloadRaw.map((r) => ({
      assigneeId: r.assigneeId,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      issueCount: parseInt(r.issueCount, 10),
      openIssues: parseInt(r.openIssues, 10),
      totalStoryPoints: parseInt(r.totalStoryPoints, 10),
      totalTimeSpent: parseInt(r.totalTimeSpent, 10),
    }));

    return { assignees };
  }

  /**
   * Cycle Time: Average time from in_progress to done, grouped by issue type.
   */
  async getCycleTime(
    projectId: string,
    organizationId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const qb = this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .andWhere("status.category = 'done'");

    if (startDateStr) {
      qb.andWhere('issue.updated_at >= :startDate', {
        startDate: new Date(startDateStr),
      });
    }
    if (endDateStr) {
      qb.andWhere('issue.updated_at <= :endDate', {
        endDate: new Date(endDateStr),
      });
    }

    const doneIssues = await qb.getMany();

    // Calculate cycle time: difference between createdAt and updatedAt (proxy for done date)
    // In production you'd track the actual status change timestamps
    const cycleTimes: Array<{
      type: string;
      days: number;
    }> = [];

    for (const issue of doneIssues) {
      const created = new Date(issue.createdAt).getTime();
      const completed = new Date(issue.updatedAt).getTime();
      const days = Math.max(
        0,
        Math.round(((completed - created) / (1000 * 60 * 60 * 24)) * 10) / 10,
      );
      cycleTimes.push({ type: issue.type, days });
    }

    // Overall average
    const totalDays = cycleTimes.reduce((sum, ct) => sum + ct.days, 0);
    const average =
      cycleTimes.length > 0
        ? Math.round((totalDays / cycleTimes.length) * 10) / 10
        : 0;

    // By type
    const typeMap = new Map<string, number[]>();
    for (const ct of cycleTimes) {
      if (!typeMap.has(ct.type)) typeMap.set(ct.type, []);
      typeMap.get(ct.type)!.push(ct.days);
    }

    const byType = Array.from(typeMap.entries()).map(([type, days]) => ({
      type,
      average: Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10,
      count: days.length,
    }));

    // Distribution buckets: 0-1d, 1-3d, 3-7d, 7-14d, 14-30d, 30+d
    const buckets = [
      { label: '< 1 day', min: 0, max: 1 },
      { label: '1-3 days', min: 1, max: 3 },
      { label: '3-7 days', min: 3, max: 7 },
      { label: '7-14 days', min: 7, max: 14 },
      { label: '14-30 days', min: 14, max: 30 },
      { label: '30+ days', min: 30, max: Infinity },
    ];

    const distribution = buckets.map((bucket) => ({
      label: bucket.label,
      count: cycleTimes.filter(
        (ct) => ct.days >= bucket.min && ct.days < bucket.max,
      ).length,
    }));

    return {
      average,
      byType,
      distribution,
    };
  }

  /**
   * Sprint Report: Comprehensive sprint summary.
   */
  async getSprintReport(
    projectId: string,
    sprintId: string,
    organizationId: string,
  ) {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .where('issue.sprint_id = :sprintId', { sprintId })
      .andWhere('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .orderBy('issue.position', 'ASC')
      .getMany();

    const completedIssues = issues.filter(
      (i) => i.status?.category === 'done',
    );
    const incompleteIssues = issues.filter(
      (i) => i.status?.category !== 'done',
    );

    const committedPoints = issues.reduce(
      (sum, i) => sum + (i.storyPoints || 0),
      0,
    );
    const completedPoints = completedIssues.reduce(
      (sum, i) => sum + (i.storyPoints || 0),
      0,
    );

    const totalTimeEstimate = issues.reduce(
      (sum, i) => sum + (i.timeEstimate || 0),
      0,
    );
    const totalTimeSpent = issues.reduce(
      (sum, i) => sum + (i.timeSpent || 0),
      0,
    );

    // By type breakdown
    const byType: Record<string, { total: number; completed: number }> = {};
    for (const issue of issues) {
      if (!byType[issue.type]) {
        byType[issue.type] = { total: 0, completed: 0 };
      }
      byType[issue.type].total++;
      if (issue.status?.category === 'done') {
        byType[issue.type].completed++;
      }
    }

    return {
      sprint: {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        status: sprint.status,
        startDate: sprint.startDate,
        endDate: sprint.endDate,
      },
      summary: {
        totalIssues: issues.length,
        completedIssues: completedIssues.length,
        incompleteIssues: incompleteIssues.length,
        committedPoints,
        completedPoints,
        completionRate:
          issues.length > 0
            ? Math.round((completedIssues.length / issues.length) * 100)
            : 0,
        totalTimeEstimate,
        totalTimeSpent,
      },
      byType: Object.entries(byType).map(([type, data]) => ({
        type,
        ...data,
      })),
      completedIssues: completedIssues.map((i) => ({
        id: i.id,
        key: i.key,
        title: i.title,
        type: i.type,
        storyPoints: i.storyPoints,
        assignee: i.assignee
          ? { id: i.assignee.id, displayName: i.assignee.displayName }
          : null,
      })),
      incompleteIssues: incompleteIssues.map((i) => ({
        id: i.id,
        key: i.key,
        title: i.title,
        type: i.type,
        storyPoints: i.storyPoints,
        status: i.status
          ? { name: i.status.name, category: i.status.category }
          : null,
        assignee: i.assignee
          ? { id: i.assignee.id, displayName: i.assignee.displayName }
          : null,
      })),
    };
  }

  /**
   * Sprint Burnup: Two lines tracking scope (total points) and completed points over time.
   * Unlike burndown, burnup shows both scope changes and progress.
   */
  async getSprintBurnup(
    projectId: string,
    sprintId: string,
    organizationId: string,
  ) {
    const sprint = await this.sprintRepository.findOne({
      where: { id: sprintId, projectId },
    });
    if (!sprint) {
      throw new NotFoundException('Sprint not found');
    }

    // Get all issues in this sprint
    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.sprint_id = :sprintId', { sprintId })
      .andWhere('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .getMany();

    // Determine date range
    const startDate = sprint.startDate
      ? new Date(sprint.startDate)
      : new Date(sprint.createdAt);
    const endDate = sprint.endDate
      ? new Date(sprint.endDate)
      : new Date();

    const today = new Date();
    const effectiveEnd = endDate > today ? today : endDate;

    const totalDays = Math.max(
      1,
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
    );

    const daysBetween =
      Math.ceil(
        (effectiveEnd.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    const dates: string[] = [];
    const scopeData: number[] = [];
    const completedData: number[] = [];

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);

      dates.push(dateStr);

      if (d < daysBetween) {
        // Scope: total story points of issues that existed in the sprint by end of day.
        // We approximate scope changes using createdAt — issues added to the sprint
        // after sprint start increase scope.
        const scopeIssues = issues.filter(
          (i) => new Date(i.createdAt) <= endOfDay,
        );
        const scopePoints = scopeIssues.reduce(
          (sum, i) => sum + (i.storyPoints || 0),
          0,
        );
        scopeData.push(scopePoints);

        // Completed: story points of issues in done category by end of day
        const completedPoints = issues
          .filter((issue) => {
            if (issue.status?.category !== 'done') return false;
            return new Date(issue.updatedAt) <= endOfDay;
          })
          .reduce((sum, i) => sum + (i.storyPoints || 0), 0);

        completedData.push(completedPoints);
      }
    }

    return {
      sprintName: sprint.name,
      dates,
      scopeData,
      completedData,
      totalPoints: issues.reduce((sum, i) => sum + (i.storyPoints || 0), 0),
    };
  }

  /**
   * Created vs Resolved: Count of issues created and resolved per day or week
   * over a date range.
   */
  async getCreatedVsResolved(
    projectId: string,
    organizationId: string,
    startDateStr?: string,
    endDateStr?: string,
    interval: 'day' | 'week' = 'day',
  ) {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // default 30 days

    // Get all issues for the project
    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .getMany();

    if (interval === 'week') {
      return this.buildCreatedVsResolvedWeekly(issues, startDate, endDate);
    }

    // Daily interval
    const dates: string[] = [];
    const created: number[] = [];
    const resolved: number[] = [];

    const totalDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      const dateStr = currentDate.toISOString().split('T')[0];
      const startOfDay = new Date(currentDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(currentDate);
      endOfDay.setHours(23, 59, 59, 999);

      dates.push(dateStr);

      // Created on this day
      const createdCount = issues.filter((i) => {
        const c = new Date(i.createdAt);
        return c >= startOfDay && c <= endOfDay;
      }).length;
      created.push(createdCount);

      // Resolved (moved to done) on this day — approximated using updatedAt
      const resolvedCount = issues.filter((i) => {
        if (i.status?.category !== 'done') return false;
        const u = new Date(i.updatedAt);
        return u >= startOfDay && u <= endOfDay;
      }).length;
      resolved.push(resolvedCount);
    }

    return { dates, created, resolved, interval: 'day' };
  }

  private buildCreatedVsResolvedWeekly(
    issues: Issue[],
    startDate: Date,
    endDate: Date,
  ) {
    const dates: string[] = [];
    const created: number[] = [];
    const resolved: number[] = [];

    // Align to start of week (Monday)
    const current = new Date(startDate);
    const dayOfWeek = current.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    current.setDate(current.getDate() + diff);

    while (current <= endDate) {
      const weekStart = new Date(current);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const label = `${weekStart.toISOString().split('T')[0]}`;
      dates.push(label);

      const createdCount = issues.filter((i) => {
        const c = new Date(i.createdAt);
        return c >= weekStart && c <= weekEnd;
      }).length;
      created.push(createdCount);

      const resolvedCount = issues.filter((i) => {
        if (i.status?.category !== 'done') return false;
        const u = new Date(i.updatedAt);
        return u >= weekStart && u <= weekEnd;
      }).length;
      resolved.push(resolvedCount);

      current.setDate(current.getDate() + 7);
    }

    return { dates, created, resolved, interval: 'week' };
  }

  /**
   * Timesheet: Work logs for a specific user over a date range,
   * grouped by day with issue details.
   */
  async getTimesheet(
    userId: string,
    organizationId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // default 7 days

    const qb = this.workLogRepository
      .createQueryBuilder('wl')
      .leftJoinAndSelect('wl.issue', 'issue')
      .leftJoin('issue.project', 'project')
      .addSelect(['project.id', 'project.name', 'project.key'])
      .where('wl.user_id = :userId', { userId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('wl.logged_at >= :startDate', { startDate })
      .andWhere('wl.logged_at <= :endDate', {
        endDate: new Date(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate(),
          23,
          59,
          59,
          999,
        ),
      })
      .orderBy('wl.logged_at', 'ASC');

    const workLogs = await qb.getMany();

    // Group by date
    const dayMap = new Map<
      string,
      Array<{
        workLogId: string;
        issueId: string;
        issueKey: string;
        issueTitle: string;
        projectName: string;
        timeSpent: number;
        description: string;
        loggedAt: string;
      }>
    >();

    for (const wl of workLogs) {
      const dayStr = new Date(wl.loggedAt).toISOString().split('T')[0];
      if (!dayMap.has(dayStr)) dayMap.set(dayStr, []);
      dayMap.get(dayStr)!.push({
        workLogId: wl.id,
        issueId: wl.issue?.id || wl.issueId,
        issueKey: wl.issue?.key || '',
        issueTitle: wl.issue?.title || '',
        projectName: (wl.issue as any)?.project?.name || '',
        timeSpent: wl.timeSpent,
        description: wl.description || '',
        loggedAt: wl.loggedAt.toISOString(),
      });
    }

    // Build date array for the requested range
    const dates: string[] = [];
    const totalDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      dates.push(currentDate.toISOString().split('T')[0]);
    }

    // Build entries per date
    const days = dates.map((date) => ({
      date,
      entries: dayMap.get(date) || [],
      totalMinutes: (dayMap.get(date) || []).reduce(
        (sum, e) => sum + e.timeSpent,
        0,
      ),
    }));

    // Aggregate by issue across all days
    const issueMap = new Map<
      string,
      { issueKey: string; issueTitle: string; projectName: string; totalMinutes: number }
    >();
    for (const wl of workLogs) {
      const key = wl.issue?.key || wl.issueId;
      if (!issueMap.has(key)) {
        issueMap.set(key, {
          issueKey: wl.issue?.key || '',
          issueTitle: wl.issue?.title || '',
          projectName: (wl.issue as any)?.project?.name || '',
          totalMinutes: 0,
        });
      }
      issueMap.get(key)!.totalMinutes += wl.timeSpent;
    }

    const totalMinutes = workLogs.reduce((sum, wl) => sum + wl.timeSpent, 0);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      days,
      issuesSummary: Array.from(issueMap.values()),
      totalMinutes,
    };
  }

  /**
   * Team Timesheet: Work logs for all team members on a project
   * over a date range.
   */
  async getTeamTimesheet(
    projectId: string,
    organizationId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const endDate = endDateStr ? new Date(endDateStr) : new Date();
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    const qb = this.workLogRepository
      .createQueryBuilder('wl')
      .leftJoinAndSelect('wl.issue', 'issue')
      .leftJoinAndSelect('wl.user', 'user')
      .where('issue.organization_id = :organizationId', { organizationId })
      .andWhere('wl.logged_at >= :startDate', { startDate })
      .andWhere('wl.logged_at <= :endDate', {
        endDate: new Date(
          endDate.getFullYear(),
          endDate.getMonth(),
          endDate.getDate(),
          23,
          59,
          59,
          999,
        ),
      })
      .orderBy('wl.logged_at', 'ASC');

    // Optionally filter by project
    if (projectId) {
      qb.andWhere('issue.project_id = :projectId', { projectId });
    }

    const workLogs = await qb.getMany();

    // Build date array
    const dates: string[] = [];
    const totalDays =
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    for (let d = 0; d < totalDays; d++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + d);
      dates.push(currentDate.toISOString().split('T')[0]);
    }

    // Group by user
    const userMap = new Map<
      string,
      {
        userId: string;
        displayName: string;
        avatarUrl?: string;
        dailyMinutes: Map<string, number>;
        totalMinutes: number;
      }
    >();

    for (const wl of workLogs) {
      const uid = wl.userId;
      if (!userMap.has(uid)) {
        userMap.set(uid, {
          userId: uid,
          displayName: wl.user?.displayName || 'Unknown',
          avatarUrl: wl.user?.avatarUrl,
          dailyMinutes: new Map(),
          totalMinutes: 0,
        });
      }
      const entry = userMap.get(uid)!;
      const dayStr = new Date(wl.loggedAt).toISOString().split('T')[0];
      entry.dailyMinutes.set(
        dayStr,
        (entry.dailyMinutes.get(dayStr) || 0) + wl.timeSpent,
      );
      entry.totalMinutes += wl.timeSpent;
    }

    const members = Array.from(userMap.values()).map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      dailyMinutes: dates.map((d) => m.dailyMinutes.get(d) || 0),
      totalMinutes: m.totalMinutes,
    }));

    const dailyTotals = dates.map((d) =>
      members.reduce(
        (sum, m) => sum + (m.dailyMinutes[dates.indexOf(d)] || 0),
        0,
      ),
    );

    const totalMinutes = members.reduce((sum, m) => sum + m.totalMinutes, 0);

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      dates,
      members,
      dailyTotals,
      totalMinutes,
    };
  }

  /**
   * Export project issues as JSON or CSV.
   */
  async exportProjectIssues(
    projectId: string,
    organizationId: string,
    format: 'json' | 'csv' = 'json',
  ) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const issues = await this.issueRepository
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.status', 'status')
      .leftJoinAndSelect('issue.assignee', 'assignee')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .leftJoinAndSelect('issue.sprint', 'sprint')
      .where('issue.project_id = :projectId', { projectId })
      .andWhere('issue.organization_id = :organizationId', { organizationId })
      .andWhere('issue.deleted_at IS NULL')
      .orderBy('issue.number', 'ASC')
      .getMany();

    const rows = issues.map((i) => ({
      key: i.key,
      title: i.title,
      type: i.type,
      priority: i.priority,
      status: i.status?.name || '',
      statusCategory: i.status?.category || '',
      assignee: i.assignee?.displayName || '',
      reporter: i.reporter?.displayName || '',
      sprint: i.sprint?.name || '',
      storyPoints: i.storyPoints ?? '',
      timeEstimate: i.timeEstimate ?? '',
      timeSpent: i.timeSpent ?? 0,
      dueDate: i.dueDate || '',
      labels: (i.labels || []).join('; '),
      createdAt: i.createdAt ? new Date(i.createdAt).toISOString() : '',
      updatedAt: i.updatedAt ? new Date(i.updatedAt).toISOString() : '',
    }));

    if (format === 'csv') {
      const headers = [
        'Key',
        'Title',
        'Type',
        'Priority',
        'Status',
        'Status Category',
        'Assignee',
        'Reporter',
        'Sprint',
        'Story Points',
        'Time Estimate (min)',
        'Time Spent (min)',
        'Due Date',
        'Labels',
        'Created At',
        'Updated At',
      ];

      const csvLines = [headers.join(',')];
      for (const row of rows) {
        const values = [
          row.key,
          row.title,
          row.type,
          row.priority,
          row.status,
          row.statusCategory,
          row.assignee,
          row.reporter,
          row.sprint,
          String(row.storyPoints),
          String(row.timeEstimate),
          String(row.timeSpent),
          row.dueDate,
          row.labels,
          row.createdAt,
          row.updatedAt,
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
        csvLines.push(values.join(','));
      }

      return {
        format: 'csv',
        filename: `${project.key}-issues.csv`,
        content: csvLines.join('\n'),
      };
    }

    return {
      format: 'json',
      filename: `${project.key}-issues.json`,
      content: JSON.stringify(
        { project: { key: project.key, name: project.name }, issues: rows },
        null,
        2,
      ),
    };
  }
}
