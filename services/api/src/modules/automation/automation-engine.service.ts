import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Issue } from '../issues/entities/issue.entity';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Comment } from '../comments/entities/comment.entity';
import { AutomationService } from './automation.service';
import { AutomationRule } from './entities/automation-rule.entity';
import { ActionType, TriggerContext } from './automation.types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AutomationEngineService {
  private readonly logger = new Logger(AutomationEngineService.name);

  constructor(
    @InjectRepository(Issue)
    private issueRepository: Repository<Issue>,
    @InjectRepository(IssueStatus)
    private issueStatusRepository: Repository<IssueStatus>,
    @InjectRepository(Comment)
    private commentRepository: Repository<Comment>,
    private automationService: AutomationService,
    private notificationsService: NotificationsService,
    @InjectQueue('automation')
    private automationQueue: Queue,
  ) {}

  /**
   * Main entry point: queues automation processing for async execution.
   */
  async processTrigger(
    projectId: string,
    triggerType: string,
    context: TriggerContext,
  ): Promise<void> {
    try {
      const rules = await this.automationService.findRulesForTrigger(
        projectId,
        triggerType,
      );

      if (rules.length === 0) return;

      for (const rule of rules) {
        await this.automationQueue.add(
          'execute-rule',
          {
            ruleId: rule.id,
            triggerType,
            context,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 100,
            removeOnFail: 200,
          },
        );
      }

      this.logger.log(
        `Queued ${rules.length} automation rule(s) for trigger "${triggerType}" in project ${projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue automation rules for trigger "${triggerType}": ${error.message}`,
      );
    }
  }

  /**
   * Execute a single rule against a trigger context. Called by the worker.
   */
  async executeRule(
    ruleId: string,
    triggerType: string,
    context: TriggerContext,
  ): Promise<void> {
    let rule: AutomationRule;
    try {
      rule = await this.automationService.findById(ruleId);
    } catch {
      this.logger.warn(`Rule ${ruleId} not found, skipping execution`);
      return;
    }

    if (!rule.isActive) {
      this.logger.log(`Rule "${rule.name}" (${ruleId}) is inactive, skipping`);
      return;
    }

    let issue: Issue | null = null;
    if (context.issueId) {
      issue = await this.issueRepository.findOne({
        where: { id: context.issueId, deletedAt: IsNull() },
        relations: ['status', 'assignee', 'reporter', 'sprint'],
      });
      if (!issue) {
        this.logger.warn(`Issue ${context.issueId} not found for rule "${rule.name}"`);
        return;
      }
    }

    // Evaluate conditions
    const conditionsMatch = this.automationService.evaluateConditions(
      issue || context.issue || {},
      rule.conditions || [],
    );

    if (!conditionsMatch) {
      this.logger.log(
        `Conditions not met for rule "${rule.name}" (${ruleId}) on issue ${context.issueId}`,
      );
      return;
    }

    // Execute actions
    const executedActions: any[] = [];
    let hasError = false;
    let errorMessage = '';

    for (const action of rule.actions) {
      try {
        await this.executeAction(action, issue, context);
        executedActions.push({ ...action, status: 'success' });
      } catch (err) {
        hasError = true;
        errorMessage = err.message;
        executedActions.push({ ...action, status: 'failed', error: err.message });
        this.logger.error(
          `Action "${action.type}" failed for rule "${rule.name}": ${err.message}`,
        );
      }
    }

    // Log execution
    await this.automationService.logExecution(
      ruleId,
      context.issueId || null,
      triggerType,
      executedActions,
      hasError ? 'partial_failure' : 'success',
      hasError ? errorMessage : undefined,
    );
  }

  /**
   * Dry-run: evaluate conditions and simulate actions without making changes.
   */
  async testRule(
    ruleId: string,
    issueId: string,
    organizationId: string,
  ): Promise<{
    conditionsMet: boolean;
    conditionResults: { field: string; operator: string; expected: any; actual: any; passed: boolean }[];
    actionsToExecute: any[];
  }> {
    const rule = await this.automationService.findById(ruleId);

    const issue = await this.issueRepository.findOne({
      where: { id: issueId, organizationId, deletedAt: IsNull() },
      relations: ['status', 'assignee', 'reporter', 'sprint'],
    });

    if (!issue) {
      throw new Error('Issue not found');
    }

    const conditionResults = (rule.conditions || []).map((condition: any) => {
      const fieldValue = this.getIssueFieldValue(issue, condition.field);
      const passed = this.automationService.evaluateConditions(issue, [condition]);
      return {
        field: condition.field,
        operator: condition.operator,
        expected: condition.value,
        actual: fieldValue,
        passed,
      };
    });

    const conditionsMet = conditionResults.every((r: any) => r.passed);

    return {
      conditionsMet,
      conditionResults,
      actionsToExecute: conditionsMet ? rule.actions : [],
    };
  }

  private getIssueFieldValue(issue: Issue, field: string): any {
    const map: Record<string, any> = {
      type: issue.type,
      priority: issue.priority,
      assignee: issue.assigneeId,
      assigneeId: issue.assigneeId,
      status: issue.statusId,
      statusId: issue.statusId,
      sprint: issue.sprintId,
      sprintId: issue.sprintId,
      labels: issue.labels,
      storyPoints: issue.storyPoints,
      dueDate: issue.dueDate,
      title: issue.title,
      description: issue.description,
    };
    return map[field] !== undefined ? map[field] : (issue as any)[field];
  }

  private async executeAction(
    action: any,
    issue: Issue | null,
    context: TriggerContext,
  ): Promise<void> {
    if (!issue && action.type !== ActionType.SEND_NOTIFICATION) {
      throw new Error(`Action "${action.type}" requires an issue context`);
    }

    switch (action.type) {
      case ActionType.SET_FIELD:
        await this.executeSetField(issue!, action.config);
        break;

      case ActionType.ASSIGN_USER:
        await this.executeAssignUser(issue!, action.config);
        break;

      case ActionType.TRANSITION_STATUS:
        await this.executeTransitionStatus(issue!, action.config);
        break;

      case ActionType.ADD_LABEL:
        await this.executeAddLabel(issue!, action.config);
        break;

      case ActionType.REMOVE_LABEL:
        await this.executeRemoveLabel(issue!, action.config);
        break;

      case ActionType.ADD_COMMENT:
        await this.executeAddComment(issue!, action.config, context);
        break;

      case ActionType.SEND_NOTIFICATION:
        await this.executeSendNotification(action.config, issue, context);
        break;

      case ActionType.MOVE_TO_SPRINT:
        await this.executeMoveToSprint(issue!, action.config);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeSetField(issue: Issue, config: any): Promise<void> {
    const { field, value } = config;
    const updateData: any = {};

    const fieldMap: Record<string, string> = {
      priority: 'priority',
      type: 'type',
      storyPoints: 'storyPoints',
      dueDate: 'dueDate',
      title: 'title',
      description: 'description',
    };

    const column = fieldMap[field];
    if (!column) {
      throw new Error(`Cannot set field "${field}"`);
    }

    updateData[column] = value;
    await this.issueRepository.update(issue.id, updateData);
    this.logger.log(`Set ${field}=${value} on issue ${issue.key}`);
  }

  private async executeAssignUser(issue: Issue, config: any): Promise<void> {
    const { userId } = config;
    await this.issueRepository.update(issue.id, { assigneeId: userId });
    this.logger.log(`Assigned user ${userId} to issue ${issue.key}`);
  }

  private async executeTransitionStatus(
    issue: Issue,
    config: any,
  ): Promise<void> {
    const { statusId } = config;
    const status = await this.issueStatusRepository.findOne({
      where: { id: statusId },
    });
    if (!status) {
      throw new Error(`Status ${statusId} not found`);
    }
    await this.issueRepository.update(issue.id, { statusId });
    this.logger.log(`Transitioned issue ${issue.key} to status "${status.name}"`);
  }

  private async executeAddLabel(issue: Issue, config: any): Promise<void> {
    const { label } = config;
    const currentLabels = issue.labels || [];
    if (!currentLabels.includes(label)) {
      await this.issueRepository.update(issue.id, {
        labels: [...currentLabels, label],
      });
      this.logger.log(`Added label "${label}" to issue ${issue.key}`);
    }
  }

  private async executeRemoveLabel(issue: Issue, config: any): Promise<void> {
    const { label } = config;
    const currentLabels = issue.labels || [];
    if (currentLabels.includes(label)) {
      await this.issueRepository.update(issue.id, {
        labels: currentLabels.filter((l: string) => l !== label),
      });
      this.logger.log(`Removed label "${label}" from issue ${issue.key}`);
    }
  }

  private async executeAddComment(
    issue: Issue,
    config: any,
    context: TriggerContext,
  ): Promise<void> {
    const { content } = config;
    const comment = this.commentRepository.create({
      issueId: issue.id,
      authorId: context.userId || issue.reporterId,
      content: `[Automation] ${content}`,
    });
    await this.commentRepository.save(comment);
    this.logger.log(`Added automation comment to issue ${issue.key}`);
  }

  private async executeSendNotification(
    config: any,
    issue: Issue | null,
    context: TriggerContext,
  ): Promise<void> {
    const { userIds, message } = config;
    const targetIds = userIds || [];

    for (const userId of targetIds) {
      await this.notificationsService.create({
        userId,
        type: 'automation:notification',
        title: message || 'Automation notification',
        body: issue ? `Triggered on issue ${issue.key}` : 'Automation rule triggered',
        data: {
          issueId: issue?.id,
          issueKey: issue?.key,
        },
      });
    }
    this.logger.log(`Sent notification to ${targetIds.length} user(s)`);
  }

  private async executeMoveToSprint(
    issue: Issue,
    config: any,
  ): Promise<void> {
    const { sprintId } = config;
    await this.issueRepository.update(issue.id, { sprintId });
    this.logger.log(`Moved issue ${issue.key} to sprint ${sprintId}`);
  }
}
