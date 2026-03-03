import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutomationRule } from './entities/automation-rule.entity';
import { AutomationLog } from './entities/automation-log.entity';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { AutomationCondition, ConditionOperator } from './automation.types';

@Injectable()
export class AutomationService {
  constructor(
    @InjectRepository(AutomationRule)
    private ruleRepository: Repository<AutomationRule>,
    @InjectRepository(AutomationLog)
    private logRepository: Repository<AutomationLog>,
  ) {}

  async create(
    dto: CreateRuleDto,
    projectId: string,
    organizationId: string,
    userId: string,
  ): Promise<AutomationRule> {
    const rule = this.ruleRepository.create({
      ...dto,
      projectId,
      organizationId,
      createdBy: userId,
    });
    return this.ruleRepository.save(rule);
  }

  async findAll(projectId: string): Promise<AutomationRule[]> {
    return this.ruleRepository.find({
      where: { projectId },
      relations: ['creator'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<AutomationRule> {
    const rule = await this.ruleRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!rule) {
      throw new NotFoundException('Automation rule not found');
    }
    return rule;
  }

  async update(id: string, dto: UpdateRuleDto): Promise<AutomationRule> {
    const rule = await this.findById(id);
    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async delete(id: string): Promise<void> {
    const rule = await this.findById(id);
    await this.ruleRepository.remove(rule);
  }

  async toggle(id: string): Promise<AutomationRule> {
    const rule = await this.findById(id);
    rule.isActive = !rule.isActive;
    return this.ruleRepository.save(rule);
  }

  async findRulesForTrigger(
    projectId: string,
    triggerType: string,
  ): Promise<AutomationRule[]> {
    return this.ruleRepository.find({
      where: { projectId, triggerType, isActive: true },
    });
  }

  evaluateConditions(issue: any, conditions: AutomationCondition[]): boolean {
    if (!conditions || conditions.length === 0) return true;

    return conditions.every((condition) => {
      const fieldValue = this.getFieldValue(issue, condition.field);
      return this.evaluateCondition(fieldValue, condition.operator, condition.value);
    });
  }

  private getFieldValue(issue: any, field: string): any {
    const fieldMap: Record<string, string> = {
      type: 'type',
      priority: 'priority',
      assignee: 'assigneeId',
      assigneeId: 'assigneeId',
      reporter: 'reporterId',
      reporterId: 'reporterId',
      status: 'statusId',
      statusId: 'statusId',
      sprint: 'sprintId',
      sprintId: 'sprintId',
      labels: 'labels',
      storyPoints: 'storyPoints',
      dueDate: 'dueDate',
      title: 'title',
      description: 'description',
    };

    const mappedField = fieldMap[field] || field;
    return issue[mappedField];
  }

  private evaluateCondition(
    fieldValue: any,
    operator: ConditionOperator,
    conditionValue: any,
  ): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return fieldValue === conditionValue;

      case ConditionOperator.NOT_EQUALS:
        return fieldValue !== conditionValue;

      case ConditionOperator.IN:
        return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);

      case ConditionOperator.NOT_IN:
        return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);

      case ConditionOperator.CONTAINS:
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(conditionValue);
        }
        if (typeof fieldValue === 'string') {
          return fieldValue.includes(conditionValue);
        }
        return false;

      case ConditionOperator.NOT_CONTAINS:
        if (Array.isArray(fieldValue)) {
          return !fieldValue.includes(conditionValue);
        }
        if (typeof fieldValue === 'string') {
          return !fieldValue.includes(conditionValue);
        }
        return true;

      case ConditionOperator.IS_EMPTY:
        return (
          fieldValue === null ||
          fieldValue === undefined ||
          fieldValue === '' ||
          (Array.isArray(fieldValue) && fieldValue.length === 0)
        );

      case ConditionOperator.IS_NOT_EMPTY:
        return (
          fieldValue !== null &&
          fieldValue !== undefined &&
          fieldValue !== '' &&
          !(Array.isArray(fieldValue) && fieldValue.length === 0)
        );

      case ConditionOperator.GREATER_THAN:
        return typeof fieldValue === 'number' && fieldValue > conditionValue;

      case ConditionOperator.LESS_THAN:
        return typeof fieldValue === 'number' && fieldValue < conditionValue;

      default:
        return false;
    }
  }

  async logExecution(
    ruleId: string,
    issueId: string | null,
    triggerEvent: string,
    actionsExecuted: any[],
    status: string,
    errorMessage?: string,
  ): Promise<AutomationLog> {
    const log = this.logRepository.create({
      ruleId,
      issueId,
      triggerEvent,
      actionsExecuted,
      status,
      errorMessage,
    });
    const saved = await this.logRepository.save(log);

    // Update rule execution stats
    await this.ruleRepository
      .createQueryBuilder()
      .update()
      .set({
        executionCount: () => 'execution_count + 1',
        lastExecutedAt: new Date(),
      })
      .where('id = :ruleId', { ruleId })
      .execute();

    return saved;
  }

  async getExecutionLogs(
    ruleId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const [items, total] = await this.logRepository.findAndCount({
      where: { ruleId },
      relations: ['issue'],
      order: { executedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }
}
