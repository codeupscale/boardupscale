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
      issueRepo.find.mockResolvedValue([issue1, issue2]);

      const result = await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].issues).toEqual([issue1]);
      expect(result[1].issues).toEqual([issue2]);
    });

    it('should verify project exists', async () => {
      projectsService.findById.mockRejectedValue(new NotFoundException('Project not found'));

      await expect(service.getBoardData('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return empty issues for statuses with no issues', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      statusRepo.find.mockResolvedValue([mockIssueStatus()]);
      issueRepo.find.mockResolvedValue([]);

      const result = await service.getBoardData(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID);

      expect(result[0].issues).toEqual([]);
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
    it('should update positions for all reorder items', async () => {
      projectsService.findById.mockResolvedValue(mockProject());
      issueRepo.update.mockResolvedValue(mockUpdateResult());

      await service.reorderIssues(TEST_IDS.PROJECT_ID, TEST_IDS.ORG_ID, {
        items: [
          { issueId: 'issue-1', statusId: 'status-1', position: 0 },
          { issueId: 'issue-2', statusId: 'status-2', position: 1 },
          { issueId: 'issue-3', statusId: 'status-1', position: 2 },
        ],
      });

      expect(issueRepo.update).toHaveBeenCalledTimes(3);
      expect(issueRepo.update).toHaveBeenCalledWith('issue-1', { statusId: 'status-1', position: 0 });
      expect(issueRepo.update).toHaveBeenCalledWith('issue-2', { statusId: 'status-2', position: 1 });
      expect(issueRepo.update).toHaveBeenCalledWith('issue-3', { statusId: 'status-1', position: 2 });
    });
  });
});
