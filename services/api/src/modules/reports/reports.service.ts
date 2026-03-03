import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Sprint } from '../sprints/entities/sprint.entity';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { WorkLog } from '../issues/entities/work-log.entity';
import { User } from '../users/entities/user.entity';

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
}
