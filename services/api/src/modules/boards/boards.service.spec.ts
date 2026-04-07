import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BoardsService } from './boards.service';
import { IssueStatus } from '../issues/entities/issue-status.entity';
import { Issue } from '../issues/entities/issue.entity';
import { ProjectsService } from '../projects/projects.service';
import {
  createMockRepository,
  createMockQueryBuilder,
  createMockProjectsService,
  mockUpdateResult,
} from '../../test/test-utils';
import { mockProject, mockIssue, mockIssueStatus, TEST_IDS } from '../../test/mock-factories';

describe('BoardsService', () => {
  let service: BoardsService;
  let statusRepo: ReturnType<typeof createMockRepository>;
  let issueRepo: ReturnType<typeof createMockRepository>;
  let projectsService: ReturnType<typeof createMockProjectsService>;

  beforeEach(async () => {
    statusRepo = createMockRepository();
    issueRepo = createMockRepository();
    projectsService = createMockProjectsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BoardsService,
        { provide: getRepositoryToken(IssueStatus), useValue: statusRepo },
        { provide: getRepositoryToken(Issue), useValue: issueRepo },
        { provide: ProjectsService, useValue: projectsService },
      ],
    }).compile();

    service = module.get<BoardsService>(BoardsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBoardData', () => {
    it('should return statuses with grouped issues', async () => {
      projectsService.findById.mockResolvedValue(mockProject());

      const todoStatus = mockIssueStatus({ id: 'status-1', name: 'To Do' });
      const inProgressStatus = mockIssueStatus({ id: 'status-2', name: 'In Progress', category: 'in_progress' });
      statusRepo.find.mockResolvedValue([todoStatus, inProgressStatus]);

      const issue1 = mockIssue({ id: 'issue-1', statusId: 'status-1' });
      const issue2 = mockIssue({ id: 'issue-2', statusId: 'status-2' });
      const mainQb = createMockQueryBuilder([issue1, issue2]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([
        { statusId: 'status-1', total: '1' },
        { statusId: 'status-2', total: '1' },
      ]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      const result = await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].issues).toEqual([issue1]);
      expect(result[1].issues).toEqual([issue2]);
      expect(result[0].total).toBe(1);
      expect(result[0].hasMore).toBe(false);
    });

    it('should verify project exists', async () => {
      projectsService.findById.mockRejectedValue(new NotFoundException('Project not found'));

      await expect(service.getBoardData('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return empty issues for statuses with no issues', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      const result = await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result[0].issues).toEqual([]);
      expect(result[0].total).toBe(0);
      expect(result[0].hasMore).toBe(false);
    });

    it('should apply assignee filter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        assigneeId: TEST_IDS.USER_ID,
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith(
        'issue.assigneeId = :assigneeId',
        { assigneeId: TEST_IDS.USER_ID },
      );
      expect(countQb.andWhere).toHaveBeenCalledWith(
        'issue.assigneeId = :assigneeId',
        { assigneeId: TEST_IDS.USER_ID },
      );
    });

    it('should apply type filter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        type: 'bug',
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith(
        'issue.type = :type',
        { type: 'bug' },
      );
    });

    it('should apply priority filter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        priority: 'critical',
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith(
        'issue.priority = :priority',
        { priority: 'critical' },
      );
    });

    it('should apply search filter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        search: 'login bug',
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith(
        '(issue.title ILIKE :search OR issue.key ILIKE :search)',
        { search: '%login bug%' },
      );
    });

    it('should apply sprint filter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        sprintId: TEST_IDS.SPRINT_ID,
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith(
        'issue.sprintId = :sprintId',
        { sprintId: TEST_IDS.SPRINT_ID },
      );
    });

    it('should filter backlog (no sprint) when sprintId is "backlog"', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      const mainQb = createMockQueryBuilder([]);
      const countQb = createMockQueryBuilder([]);
      countQb.getRawMany.mockResolvedValue([]);
      issueRepo.createQueryBuilder
        .mockReturnValueOnce(mainQb)
        .mockReturnValueOnce(countQb);

      await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        sprintId: 'backlog',
      });

      expect(mainQb.andWhere).toHaveBeenCalledWith('issue.sprintId IS NULL');
    });
  });

  describe('getColumnIssues', () => {
    it('should return paginated issues for a column', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const issue1 = mockIssue({ id: 'issue-1', statusId: TEST_IDS.STATUS_ID });
      const qb = createMockQueryBuilder([issue1]);
      qb.getManyAndCount.mockResolvedValue([[issue1], 1]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getColumnIssues(
        TEST_IDS.PROJECT_ID,
        TEST_IDS.STATUS_ID,
        TEST_IDS.ORG_ID,
        {},
        0,
      );

      expect(result.issues).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
      expect(result.offset).toBe(0);
    });

    it('should indicate hasMore when more issues remain', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const issues = Array.from({ length: 50 }, (_, i) =>
        mockIssue({ id: `issue-${i}`, statusId: TEST_IDS.STATUS_ID }),
      );
      const qb = createMockQueryBuilder(issues);
      qb.getManyAndCount.mockResolvedValue([issues, 100]);
      issueRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getColumnIssues(
        TEST_IDS.PROJECT_ID,
        TEST_IDS.STATUS_ID,
        TEST_IDS.ORG_ID,
        { columnLimit: 50 },
        0,
      );

      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(100);
    });
  });

  describe('createStatus', () => {
    it('should create a new status column', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const newStatus = mockIssueStatus({ name: 'In Review', position: 2 });
      statusRepo.create.mockReturnValue(newStatus);
      statusRepo.save.mockResolvedValue(newStatus);

      const result = await service.createStatus(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        name: 'In Review',
        category: 'in_progress',
        position: 2,
      });

      expect(result).toEqual(newStatus);
    });

    it('should accept wipLimit parameter', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const newStatus = mockIssueStatus({ name: 'In Progress', wipLimit: 5 });
      statusRepo.create.mockReturnValue(newStatus);
      statusRepo.save.mockResolvedValue(newStatus);

      const result = await service.createStatus(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        name: 'In Progress',
        category: 'in_progress',
        position: 1,
        wipLimit: 5,
      });

      expect(statusRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ wipLimit: 5 }),
      );
    });

    it('should auto-calculate position when not provided', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const qb = createMockQueryBuilder();
      qb.getRawOne.mockResolvedValue({ max: 3 });
      statusRepo.createQueryBuilder.mockReturnValue(qb);
      const newStatus = mockIssueStatus({ position: 4 });
      statusRepo.create.mockReturnValue(newStatus);
      statusRepo.save.mockResolvedValue(newStatus);

      await service.createStatus(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        name: 'New Column',
      });

      expect(statusRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 4 }),
      );
    });

    it('should handle empty board (no existing statuses)', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const qb = createMockQueryBuilder();
      qb.getRawOne.mockResolvedValue({ max: null });
      statusRepo.createQueryBuilder.mockReturnValue(qb);
      const newStatus = mockIssueStatus({ position: 0 });
      statusRepo.create.mockReturnValue(newStatus);
      statusRepo.save.mockResolvedValue(newStatus);

      await service.createStatus(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        name: 'First Column',
      });

      expect(statusRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ position: 0 }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update status fields', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const status = mockIssueStatus();
      statusRepo.findOne.mockResolvedValue(status);
      const updated = mockIssueStatus({ name: 'Updated Name' });
      statusRepo.save.mockResolvedValue(updated);

      const result = await service.updateStatus(TEST_IDS.PROJECT_ID, TEST_IDS.STATUS_ID, TEST_IDS.ORG_ID, {
        name: 'Updated Name',
      });

      expect(result).toEqual(updated);
    });

    it('should update wipLimit', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const status = mockIssueStatus({ wipLimit: 0 });
      statusRepo.findOne.mockResolvedValue(status);
      const updated = mockIssueStatus({ wipLimit: 3 });
      statusRepo.save.mockResolvedValue(updated);

      const result = await service.updateStatus(TEST_IDS.PROJECT_ID, TEST_IDS.STATUS_ID, TEST_IDS.ORG_ID, {
        wipLimit: 3,
      } as any);

      expect(result.wipLimit).toBe(3);
    });

    it('should throw NotFoundException when status not found', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStatus(TEST_IDS.PROJECT_ID, 'bad-id', TEST_IDS.ORG_ID, { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteStatus', () => {
    it('should delete status and move issues to fallback', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const statusToDelete = mockIssueStatus({ id: 'status-to-delete' });
      statusRepo.findOne.mockResolvedValue(statusToDelete);

      const fallback = mockIssueStatus({ id: 'fallback-status' });
      statusRepo.find.mockResolvedValue([statusToDelete, fallback]);

      const qb = createMockQueryBuilder();
      issueRepo.createQueryBuilder.mockReturnValue(qb);
      statusRepo.remove.mockResolvedValue(statusToDelete);

      await service.deleteStatus(TEST_IDS.PROJECT_ID, 'status-to-delete', TEST_IDS.ORG_ID);

      expect(qb.set).toHaveBeenCalledWith({ statusId: 'fallback-status' });
      expect(statusRepo.remove).toHaveBeenCalledWith(statusToDelete);
    });

    it('should throw BadRequestException when deleting the last status', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      const onlyStatus = mockIssueStatus();
      statusRepo.findOne.mockResolvedValue(onlyStatus);
      statusRepo.find.mockResolvedValue([onlyStatus]); // only one status

      await expect(
        service.deleteStatus(TEST_IDS.PROJECT_ID, TEST_IDS.STATUS_ID, TEST_IDS.ORG_ID),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.deleteStatus(TEST_IDS.PROJECT_ID, TEST_IDS.STATUS_ID, TEST_IDS.ORG_ID),
      ).rejects.toThrow('Cannot delete the last status column');
    });
  });

  describe('reorderIssues', () => {
    it('should update positions for all reorder items when no WIP limits', async () => {
      projectsService.findById.mockResolvedValue(mockProject());

      // Status lookups for WIP limit check (wipLimit=0 means no limit)
      const status1 = mockIssueStatus({ id: 'status-1', wipLimit: 0 });
      const status2 = mockIssueStatus({ id: 'status-2', wipLimit: 0 });
      statusRepo.findOne
        .mockResolvedValueOnce(status1)
        .mockResolvedValueOnce(status2);

      // New implementation uses a single batch UPDATE via issueRepository.query()
      issueRepo.query.mockResolvedValue([]);

      await service.reorderIssues(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        items: [
          { issueId: 'issue-1', statusId: 'status-1', position: 0 },
          { issueId: 'issue-2', statusId: 'status-2', position: 1 },
          { issueId: 'issue-3', statusId: 'status-1', position: 2 },
        ],
      });

      // Single batch query instead of N individual updates — no N+1
      expect(issueRepo.query).toHaveBeenCalledTimes(1);
      expect(issueRepo.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE issues'),
        expect.arrayContaining(['issue-1', 'issue-2', 'issue-3', TEST_IDS.ORG_ID]),
      );
    });

    it('should throw BadRequestException when WIP limit exceeded', async () => {
      projectsService.findById.mockResolvedValue(mockProject());

      const status = mockIssueStatus({ id: 'status-1', wipLimit: 2 });
      statusRepo.findOne.mockResolvedValue(status);

      // Currently 2 issues in this status, new issue not already in target
      const countQb = createMockQueryBuilder();
      countQb.getCount.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      issueRepo.createQueryBuilder.mockReturnValue(countQb);

      await expect(
        service.reorderIssues(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
          items: [
            { issueId: 'new-issue', statusId: 'status-1', position: 0 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when target status not found', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reorderIssues(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
          items: [
            { issueId: 'issue-1', statusId: 'bad-status', position: 0 },
          ],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
