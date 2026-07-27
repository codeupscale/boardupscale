import { classifyProjectHealth } from './project-health.classifier';
import {
  HEALTH_AT_RISK_OPEN_MIN,
  HEALTH_AT_RISK_OVERDUE_MIN,
} from './project-health.constants';
import { PROJECT_HEALTH_STATUS_SQL } from './project-health.sql';

/**
 * Locks SQL CASE (`PROJECT_HEALTH_STATUS_SQL`) to the same rules as
 * `classifyProjectHealth` — prevents silent dashboard/table drift.
 */
describe('project-health SQL ↔ classifier parity', () => {
  it('SQL constant embeds the same At Risk thresholds as TS', () => {
    expect(PROJECT_HEALTH_STATUS_SQL).toContain(
      `open_tickets >= ${HEALTH_AT_RISK_OPEN_MIN}`,
    );
    expect(PROJECT_HEALTH_STATUS_SQL).toContain(
      `overdue_tickets >= ${HEALTH_AT_RISK_OVERDUE_MIN}`,
    );
    expect(PROJECT_HEALTH_STATUS_SQL).toContain("THEN 'blocked'");
    expect(PROJECT_HEALTH_STATUS_SQL).toContain("THEN 'completed'");
    expect(PROJECT_HEALTH_STATUS_SQL).toContain("THEN 'at_risk'");
    expect(PROJECT_HEALTH_STATUS_SQL).toContain("THEN 'active'");
  });

  it('mirrors classifier precedence for representative inputs', () => {
    const cases: Array<{
      name: string;
      input: {
        totalTickets: number;
        completedTickets: number;
        openTickets: number;
        blockedOpenTickets: number;
        overdueTickets: number;
      };
      expected: string;
    }> = [
      {
        name: 'empty → blocked',
        input: {
          totalTickets: 0,
          completedTickets: 0,
          openTickets: 0,
          blockedOpenTickets: 0,
          overdueTickets: 0,
        },
        expected: 'blocked',
      },
      {
        name: 'all done → completed',
        input: {
          totalTickets: 5,
          completedTickets: 5,
          openTickets: 0,
          blockedOpenTickets: 0,
          overdueTickets: 0,
        },
        expected: 'completed',
      },
      {
        name: 'high open + overdue → at_risk',
        input: {
          totalTickets: 20,
          completedTickets: 5,
          openTickets: HEALTH_AT_RISK_OPEN_MIN,
          blockedOpenTickets: 0,
          overdueTickets: HEALTH_AT_RISK_OVERDUE_MIN,
        },
        expected: 'at_risk',
      },
      {
        name: 'has open work → active',
        input: {
          totalTickets: 10,
          completedTickets: 4,
          openTickets: 2,
          blockedOpenTickets: 0,
          overdueTickets: 1,
        },
        expected: 'active',
      },
      {
        name: 'only blocked links left → at_risk',
        input: {
          totalTickets: 3,
          completedTickets: 3,
          openTickets: 0,
          blockedOpenTickets: 1,
          overdueTickets: 0,
        },
        expected: 'at_risk',
      },
    ];

    for (const c of cases) {
      const { status } = classifyProjectHealth(c.input);
      expect(status).toBe(c.expected);

      // Documented SQL precedence (same order as CASE arms).
      const sqlStatus = classifyViaSqlRules(c.input);
      expect(sqlStatus).toBe(c.expected);
    }
  });
});

/** Pure JS mirror of PROJECT_HEALTH_STATUS_SQL for lockstep tests. */
function classifyViaSqlRules(input: {
  totalTickets: number;
  completedTickets: number;
  openTickets: number;
  blockedOpenTickets: number;
  overdueTickets: number;
}): string {
  const total_tickets = input.totalTickets;
  const completed_tickets = input.completedTickets;
  const open_tickets = input.openTickets;
  const blocked_open_tickets = input.blockedOpenTickets;
  const overdue_tickets = input.overdueTickets;

  if (total_tickets === 0) return 'blocked';
  if (
    open_tickets === 0 &&
    blocked_open_tickets === 0 &&
    overdue_tickets === 0 &&
    completed_tickets === total_tickets
  ) {
    return 'completed';
  }
  if (
    open_tickets >= HEALTH_AT_RISK_OPEN_MIN &&
    overdue_tickets >= HEALTH_AT_RISK_OVERDUE_MIN
  ) {
    return 'at_risk';
  }
  if (open_tickets > 0 || overdue_tickets > 0) return 'active';
  return 'at_risk';
}
