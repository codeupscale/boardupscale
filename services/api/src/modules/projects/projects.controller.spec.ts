import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { DataSource } from 'typeorm';
import { PermissionsService } from '../permissions/permissions.service';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { REQUEST } from '@nestjs/core';
import { mockProject, mockProjectMember, TEST_IDS } from '../../test/mock-factories';
import { createMockProjectsService } from '../../test/test-utils';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  let projectsService: ReturnType<typeof createMockProjectsService>;

  beforeEach(async () => {
    projectsService = createMockProjectsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: PermissionsService, useValue: { checkPermission: jest.fn().mockResolvedValue(true) } },
        { provide: DataSource, useValue: { getRepository: jest.fn() } },
        { provide: ResolveProjectPipe, useValue: { transform: jest.fn((v) => v) } },
        { provide: REQUEST, useValue: { user: { organizationId: TEST_IDS.ORG_ID } } },
      ],
    })
      .compile();

    controller = await module.resolve<ProjectsController>(ProjectsController);
  });

  describe('GET /projects', () => {
    it('should return paginated projects', async () => {
      const projects = [mockProject()];
      projectsService.findAll.mockResolvedValue(projects);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.findAll(TEST_IDS.ORG_ID, user);

      expect(result).toEqual({ data: projects });
      expect(projectsService.findAll).toHaveBeenCalledWith(
        TEST_IDS.ORG_ID,
        TEST_IDS.USER_ID,
        undefined,
      );
    });
  });

  describe('POST /projects', () => {
    it('should create a new project', async () => {
      const dto = { name: 'Test', key: 'TEST' };
      const project = mockProject();
      projectsService.create.mockResolvedValue(project);
      const user = { id: TEST_IDS.USER_ID };

      const result = await controller.create(dto as any, TEST_IDS.ORG_ID, user);

      expect(result).toEqual(project);
      expect(projectsService.create).toHaveBeenCalledWith(dto, TEST_IDS.ORG_ID, TEST_IDS.USER_ID);
    });
  });

  describe('GET /projects/:id', () => {
    it('should return a single project', async () => {
      const project = mockProject();
      projectsService.findById.mockResolvedValue(project);

      const result = await controller.findOne(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual(project);
    });
  });

  describe('PATCH /projects/:id', () => {
    it('should update a project', async () => {
      const updated = mockProject({ name: 'Updated' });
      projectsService.update.mockResolvedValue(updated);

      const result = await controller.update(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, { name: 'Updated' });

      expect(result).toEqual(updated);
    });
  });

  describe('DELETE /projects/:id', () => {
    it('should archive a project', async () => {
      projectsService.archive.mockResolvedValue(undefined);

      await controller.archive(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(projectsService.archive).toHaveBeenCalledWith(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);
    });
  });

  describe('GET /projects/:id/members', () => {
    it('should return project members', async () => {
      const members = [mockProjectMember()];
      projectsService.getMembers.mockResolvedValue(members);

      const result = await controller.getMembers(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toEqual({ data: members });
    });
  });

  describe('POST /projects/:id/members', () => {
    it('should add a member to the project', async () => {
      const member = mockProjectMember({ userId: 'new-user' });
      projectsService.addMember.mockResolvedValue(member);

      const result = await controller.addMember(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        userId: 'new-user',
        role: 'developer',
      });

      expect(result).toEqual(member);
    });
  });

  describe('DELETE /projects/:id/members/:userId', () => {
    it('should remove a member from the project', async () => {
      projectsService.removeMember.mockResolvedValue(undefined);

      await controller.removeMember(TEST_IDS.PROJECT_ID, 'user-to-remove', TEST_IDS.ORG_ID);

      expect(projectsService.removeMember).toHaveBeenCalledWith(
        TEST_IDS.PROJECT_ID,
        TEST_IDS.ORG_ID,
        'user-to-remove',
      );
    });
  });
});
