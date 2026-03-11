import { Worker, Job } from 'bullmq';
import { Pool } from 'pg';
import { createRedisConnection } from '../redis';

// ── Job payload types ───────────────────────────────────────────────────────

interface ExecuteRuleJobData {
  ruleId: string;
  triggerType: string;
  context: {
    issueId?: string;
    userId?: string;
    commentId?: string;
    sprintId?: string;
    previousValues?: Record<string, any>;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getRule(pool: Pool, ruleId: string): Promise<any | null> {
  const result = await pool.query(
    'SELECT * FROM automation_rules WHERE id = $1 AND is_active = true',
    [ruleId],
  );
  return result.rows[0] || null;
}

async function getIssue(pool: Pool, issueId: string): Promise<any | null> {
  const result = await pool.query(
    'SELECT * FROM issues WHERE id = $1 AND deleted_at IS NULL',
    [issueId],
  );
  return result.rows[0] || null;
}

function evaluateConditions(issue: any, conditions: any[]): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition: any) => {
    const fieldValue = getFieldValue(issue, condition.field);
    return evaluateCondition(fieldValue, condition.operator, condition.value);
  });
}

function getFieldValue(issue: any, field: string): any {
  const fieldMap: Record<string, string> = {
    type: 'type',
    priority: 'priority',
    assignee: 'assignee_id',
    assigneeId: 'assignee_id',
    reporter: 'reporter_id',
    reporterId: 'reporter_id',
    status: 'status_id',
    statusId: 'status_id',
    sprint: 'sprint_id',
    sprintId: 'sprint_id',
    labels: 'labels',
    storyPoints: 'story_points',
    dueDate: 'due_date',
    title: 'title',
    description: 'description',
  };
  const mapped = fieldMap[field] || field;
  return issue[mapped];
}

function evaluateCondition(fieldValue: any, operator: string, conditionValue: any): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue;
    case 'not_equals':
      return fieldValue !== conditionValue;
    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
    case 'not_in':
      return Array.isArray(conditionValue) && !conditionValue.includes(fieldValue);
    case 'contains':
      if (Array.isArray(fieldValue)) return fieldValue.includes(conditionValue);
      if (typeof fieldValue === 'string') return fieldValue.includes(conditionValue);
      return false;
    case 'not_contains':
      if (Array.isArray(fieldValue)) return !fieldValue.includes(conditionValue);
      if (typeof fieldValue === 'string') return !fieldValue.includes(conditionValue);
      return true;
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || fieldValue === '' ||
        (Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && fieldValue !== '' &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);
    case 'greater_than':
      return typeof fieldValue === 'number' && fieldValue > conditionValue;
    case 'less_than':
      return typeof fieldValue === 'number' && fieldValue < conditionValue;
    default:
      return false;
  }
}

async function executeAction(
  pool: Pool,
  action: any,
  issue: any,
  context: ExecuteRuleJobData['context'],
): Promise<void> {
  const config = action.config || {};

  switch (action.type) {
    case 'set_field': {
      const fieldMap: Record<string, string> = {
        priority: 'priority',
        type: 'type',
        storyPoints: 'story_points',
        dueDate: 'due_date',
        title: 'title',
        description: 'description',
      };
      const column = fieldMap[config.field];
      if (!column) throw new Error(`Cannot set field "${config.field}"`);
      await pool.query(
        `UPDATE issues SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
        [config.value, issue.id],
      );
      break;
    }

    case 'assign_user':
      await pool.query(
        'UPDATE issues SET assignee_id = $1, updated_at = NOW() WHERE id = $2',
        [config.userId, issue.id],
      );
      break;

    case 'transition':
      await pool.query(
        'UPDATE issues SET status_id = $1, updated_at = NOW() WHERE id = $2',
        [config.statusId, issue.id],
      );
      break;

    case 'add_label': {
      const currentLabels: string[] = issue.labels || [];
      if (!currentLabels.includes(config.label)) {
        const newLabels = [...currentLabels, config.label];
        await pool.query(
          'UPDATE issues SET labels = $1, updated_at = NOW() WHERE id = $2',
          [newLabels, issue.id],
        );
      }
      break;
    }

    case 'remove_label': {
      const labels: string[] = issue.labels || [];
      if (labels.includes(config.label)) {
        const filtered = labels.filter((l: string) => l !== config.label);
        await pool.query(
          'UPDATE issues SET labels = $1, updated_at = NOW() WHERE id = $2',
          [filtered, issue.id],
        );
      }
      break;
    }

    case 'add_comment':
      await pool.query(
        `INSERT INTO comments (issue_id, author_id, content, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [issue.id, context.userId || issue.reporter_id, `[Automation] ${config.content}`],
      );
      break;

    case 'notify': {
      const userIds: string[] = config.userIds || [];
      for (const uid of userIds) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, data, read, created_at)
           VALUES ($1, 'automation:notification', $2, $3, $4, false, NOW())`,
          [
            uid,
            config.message || 'Automation notification',
            `Triggered on issue ${issue.key}`,
            JSON.stringify({ issueId: issue.id, issueKey: issue.key }),
          ],
        );
      }
      break;
    }

    case 'move_sprint':
      await pool.query(
        'UPDATE issues SET sprint_id = $1, updated_at = NOW() WHERE id = $2',
        [config.sprintId, issue.id],
      );
      break;

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function logExecution(
  pool: Pool,
  ruleId: string,
  issueId: string | null,
  triggerEvent: string,
  actionsExecuted: any[],
  status: string,
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO automation_logs (rule_id, issue_id, trigger_event, actions_executed, status, error_message, executed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [ruleId, issueId, triggerEvent, JSON.stringify(actionsExecuted), status, errorMessage || null],
  );

  await pool.query(
    `UPDATE automation_rules SET execution_count = execution_count + 1, last_executed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [ruleId],
  );
}

// ── Worker ─────────────────────────────────────────────────────────────────

export function createAutomationWorker(pool: Pool): Worker {
  const worker = new Worker(
    'automation',
    async (job: Job) => {
      console.log(`[AutomationWorker] Processing job ${job.id} type="${job.name}"`);

      if (job.name !== 'execute-rule') {
        throw new Error(`[AutomationWorker] Unknown job type: "${job.name}"`);
      }

      const data = job.data as ExecuteRuleJobData;
      const { ruleId, triggerType, context } = data;

      // 1. Get the rule
      const rule = await getRule(pool, ruleId);
      if (!rule) {
        console.log(`[AutomationWorker] Rule ${ruleId} not found or inactive, skipping`);
        return;
      }

      // 2. Get the issue if applicable
      let issue: any = null;
      if (context.issueId) {
        issue = await getIssue(pool, context.issueId);
        if (!issue) {
          console.log(`[AutomationWorker] Issue ${context.issueId} not found, skipping`);
          return;
        }
      }

      // 3. Evaluate conditions
      const conditions = typeof rule.conditions === 'string'
        ? JSON.parse(rule.conditions)
        : rule.conditions;

      if (!evaluateConditions(issue || {}, conditions || [])) {
        console.log(
          `[AutomationWorker] Conditions not met for rule "${rule.name}" on issue ${context.issueId}`,
        );
        return;
      }

      // 4. Execute actions
      const actions = typeof rule.actions === 'string'
        ? JSON.parse(rule.actions)
        : rule.actions;

      const executedActions: any[] = [];
      let hasError = false;
      let errorMessage = '';

      for (const action of actions) {
        try {
          if (issue) {
            await executeAction(pool, action, issue, context);
          }
          executedActions.push({ ...action, status: 'success' });
          console.log(
            `[AutomationWorker] Action "${action.type}" succeeded for rule "${rule.name}"`,
          );
        } catch (err: any) {
          hasError = true;
          errorMessage = err.message;
          executedActions.push({ ...action, status: 'failed', error: err.message });
          console.error(
            `[AutomationWorker] Action "${action.type}" failed for rule "${rule.name}": ${err.message}`,
          );
        }
      }

      // 5. Log execution
      await logExecution(
        pool,
        ruleId,
        context.issueId || null,
        triggerType,
        executedActions,
        hasError ? 'partial_failure' : 'success',
        hasError ? errorMessage : undefined,
      );

      console.log(
        `[AutomationWorker] Rule "${rule.name}" executed: ${executedActions.length} action(s), status=${hasError ? 'partial_failure' : 'success'}`,
      );
    },
    {
      connection: createRedisConnection() as any,
      concurrency: 5,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  );

  worker.on('completed', (job: Job) => {
    console.log(`[AutomationWorker] Job ${job.id} (${job.name}) finished`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(
      `[AutomationWorker] Job ${job?.id} (${job?.name}) failed:`,
      err.message,
    );
  });

  worker.on('error', (err: Error) => {
    console.error('[AutomationWorker] Worker error:', err.message);
  });

  console.log('[AutomationWorker] Started, listening on queue "automation"');
  return worker;
}
