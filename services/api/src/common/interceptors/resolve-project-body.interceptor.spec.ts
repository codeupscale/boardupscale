import { NotFoundException } from '@nestjs/common';
import { of } from 'rxjs';
import { ResolveProjectBodyInterceptor } from './resolve-project-body.interceptor';
import { Project } from '../../modules/projects/entities/project.entity';
import { TEST_IDS } from '../../test/mock-factories';

describe('ResolveProjectBodyInterceptor', () => {
  let projectRepo: { findOne: jest.Mock };
  let aliasRepo: { findOne: jest.Mock };
  let interceptor: ResolveProjectBodyInterceptor;
  const next = { handle: jest.fn(() => of('ok')) };

  const ctx = (request: any) =>
    ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

  beforeEach(() => {
    next.handle.mockClear();
    projectRepo = { findOne: jest.fn().mockResolvedValue(null) };
    aliasRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const dataSource = {
      getRepository: jest.fn((entity) => (entity === Project ? projectRepo : aliasRepo)),
    };
    interceptor = new ResolveProjectBodyInterceptor(dataSource as any);
  });

  it("resolves a project key only within the caller's org", async () => {
    projectRepo.findOne.mockResolvedValue({ id: TEST_IDS.PROJECT_ID });
    const request = { user: { organizationId: TEST_IDS.ORG_ID }, body: { projectId: 'lin' } };

    await interceptor.intercept(ctx(request), next);

    expect(projectRepo.findOne).toHaveBeenCalledWith({
      where: { key: 'LIN', organizationId: TEST_IDS.ORG_ID },
      select: ['id'],
    });
    expect(request.body.projectId).toBe(TEST_IDS.PROJECT_ID);
  });

  it('falls back to an org-scoped key alias', async () => {
    aliasRepo.findOne.mockResolvedValue({ projectId: TEST_IDS.PROJECT_ID });
    const request = { user: { organizationId: TEST_IDS.ORG_ID }, body: { projectId: 'OLD' } };

    await interceptor.intercept(ctx(request), next);

    expect(aliasRepo.findOne).toHaveBeenCalledWith({
      where: { oldKey: 'OLD', organizationId: TEST_IDS.ORG_ID },
      select: ['projectId'],
    });
    expect(request.body.projectId).toBe(TEST_IDS.PROJECT_ID);
  });

  it("404s when the key only exists in another org", async () => {
    const request = { user: { organizationId: TEST_IDS.ORG_ID }, body: { projectId: 'LIN' } };

    await expect(interceptor.intercept(ctx(request), next)).rejects.toBeInstanceOf(NotFoundException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('404s without querying when there is no authenticated org', async () => {
    const request = { body: { projectId: 'LIN' } };

    await expect(interceptor.intercept(ctx(request), next)).rejects.toBeInstanceOf(NotFoundException);
    expect(projectRepo.findOne).not.toHaveBeenCalled();
  });

  it('passes UUIDs through untouched', async () => {
    const request = { user: { organizationId: TEST_IDS.ORG_ID }, body: { projectId: TEST_IDS.PROJECT_ID } };

    await interceptor.intercept(ctx(request), next);

    expect(projectRepo.findOne).not.toHaveBeenCalled();
    expect(request.body.projectId).toBe(TEST_IDS.PROJECT_ID);
  });
});
