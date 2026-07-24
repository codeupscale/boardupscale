import { classifyProjectHealth } from './project-health.classifier';
import {
  HEALTH_AT_RISK_OPEN_MIN,
  HEALTH_AT_RISK_OVERDUE_MIN,
} from './project-health.constants';

describe('classifyProjectHealth', () => {
  it('returns blocked for empty projects (0 tickets)', () => {
    const result = classifyProjectHealth({
      totalTickets: 0,
      completedTickets: 0,
      openTickets: 0,
      blockedOpenTickets: 0,
      overdueTickets: 0,
    });
    expect(result.status).toBe('blocked');
    expect(result.progressPercent).toBe(0);
  });

  it('returns completed when open/blocked/overdue are 0 and all tickets done', () => {
    const result = classifyProjectHealth({
      totalTickets: 8,
      completedTickets: 8,
      openTickets: 0,
      blockedOpenTickets: 0,
      overdueTickets: 0,
    });
    expect(result.status).toBe('completed');
    expect(result.progressPercent).toBe(100);
  });

  it('returns at_risk when open and overdue are both high', () => {
    const result = classifyProjectHealth({
      totalTickets: 20,
      completedTickets: 2,
      openTickets: HEALTH_AT_RISK_OPEN_MIN,
      blockedOpenTickets: 0,
      overdueTickets: HEALTH_AT_RISK_OVERDUE_MIN,
    });
    expect(result.status).toBe('at_risk');
  });

  it('returns active when there is open work but overdue is not high', () => {
    const result = classifyProjectHealth({
      totalTickets: 14,
      completedTickets: 0,
      openTickets: 14,
      blockedOpenTickets: 0,
      overdueTickets: 0,
    });
    expect(result.status).toBe('active');
  });

  it('returns active when open is below risk floor even with some overdue', () => {
    const result = classifyProjectHealth({
      totalTickets: 4,
      completedTickets: 1,
      openTickets: Math.max(1, HEALTH_AT_RISK_OPEN_MIN - 1),
      blockedOpenTickets: 0,
      overdueTickets: HEALTH_AT_RISK_OVERDUE_MIN,
    });
    expect(result.status).toBe('active');
  });

  it('returns active when overdue alone is below risk floor', () => {
    const result = classifyProjectHealth({
      totalTickets: 20,
      completedTickets: 5,
      openTickets: HEALTH_AT_RISK_OPEN_MIN + 2,
      blockedOpenTickets: 0,
      overdueTickets: Math.max(0, HEALTH_AT_RISK_OVERDUE_MIN - 1),
    });
    expect(result.status).toBe('active');
  });

  it('computes progress from completed/total', () => {
    const result = classifyProjectHealth({
      totalTickets: 10,
      completedTickets: 3,
      openTickets: 7,
      blockedOpenTickets: 0,
      overdueTickets: 0,
    });
    expect(result.status).toBe('active');
    expect(result.progressPercent).toBe(30);
  });
});
