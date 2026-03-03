import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { FilesService } from './files.service';
import { Attachment } from './entities/attachment.entity';
import { createMockRepository, createMockConfigService } from '../../test/test-utils';
import { mockAttachment, TEST_IDS } from '../../test/mock-factories';

// Mock the AWS SDK
jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
    })),
    PutObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    GetObjectCommand: jest.fn(),
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://minio.local/presigned-url'),
}));

jest.mock('uuid', () => ({ v4: () => 'mock-file-uuid' }));

describe('FilesService', () => {
  let service: FilesService;
  let attachmentRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    attachmentRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(Attachment), useValue: attachmentRepo },
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upload', () => {
    it('should upload file to S3 and create attachment record', async () => {
      const file: Express.Multer.File = {
        originalname: 'test-file.pdf',
        buffer: Buffer.from('test content'),
        mimetype: 'application/pdf',
        size: 1024,
      } as any;
      const dto = { issueId: TEST_IDS.ISSUE_ID };
      const attachment = mockAttachment();
      attachmentRepo.create.mockReturnValue(attachment);
      attachmentRepo.save.mockResolvedValue(attachment);

      const result = await service.upload(file, dto, TEST_IDS.USER_ID);

      expect(result).toEqual(attachment);
      expect(attachmentRepo.create).toHaveBeenCalledWith({
        issueId: TEST_IDS.ISSUE_ID,
        commentId: null,
        uploadedBy: TEST_IDS.USER_ID,
        fileName: 'test-file.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'mock-file-uuid-test-file.pdf',
        storageBucket: 'projectflow',
      });
    });

    it('should sanitize file name for storage key', async () => {
      const file: Express.Multer.File = {
        originalname: 'file with spaces & special!chars.pdf',
        buffer: Buffer.from('content'),
        mimetype: 'application/pdf',
        size: 512,
      } as any;
      const dto = { issueId: TEST_IDS.ISSUE_ID };
      const attachment = mockAttachment();
      attachmentRepo.create.mockReturnValue(attachment);
      attachmentRepo.save.mockResolvedValue(attachment);

      await service.upload(file, dto, TEST_IDS.USER_ID);

      expect(attachmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          storageKey: 'mock-file-uuid-file_with_spaces___special_chars.pdf',
        }),
      );
    });

    it('should handle upload without issueId (orphan file)', async () => {
      const file: Express.Multer.File = {
        originalname: 'temp.png',
        buffer: Buffer.from('img'),
        mimetype: 'image/png',
        size: 256,
      } as any;
      const dto = {};
      const attachment = mockAttachment({ issueId: null });
      attachmentRepo.create.mockReturnValue(attachment);
      attachmentRepo.save.mockResolvedValue(attachment);

      await service.upload(file, dto, TEST_IDS.USER_ID);

      expect(attachmentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ issueId: null, commentId: null }),
      );
    });
  });

  describe('getPresignedUrl', () => {
    it('should return a presigned URL for the attachment', async () => {
      const attachment = mockAttachment();
      attachmentRepo.findOne.mockResolvedValue(attachment);

      const result = await service.getPresignedUrl(TEST_IDS.ATTACHMENT_ID);

      expect(result).toBe('https://minio.local/presigned-url');
    });

    it('should throw NotFoundException when attachment not found', async () => {
      attachmentRepo.findOne.mockResolvedValue(null);

      await expect(service.getPresignedUrl('bad-id')).rejects.toThrow(NotFoundException);
      await expect(service.getPresignedUrl('bad-id')).rejects.toThrow('Attachment not found');
    });
  });

  describe('findByIssue', () => {
    it('should return attachments for an issue', async () => {
      const attachments = [mockAttachment()];
      attachmentRepo.find.mockResolvedValue(attachments);

      const result = await service.findByIssue(TEST_IDS.ISSUE_ID);

      expect(result).toEqual(attachments);
      expect(attachmentRepo.find).toHaveBeenCalledWith({
        where: { issueId: TEST_IDS.ISSUE_ID },
        relations: ['uploader'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('delete', () => {
    it('should delete file from S3 and remove attachment record', async () => {
      const attachment = mockAttachment({ uploadedBy: TEST_IDS.USER_ID });
      attachmentRepo.findOne.mockResolvedValue(attachment);
      attachmentRepo.remove.mockResolvedValue(attachment);

      await service.delete(TEST_IDS.ATTACHMENT_ID, TEST_IDS.USER_ID);

      expect(attachmentRepo.remove).toHaveBeenCalledWith(attachment);
    });

    it('should throw NotFoundException when attachment not found', async () => {
      attachmentRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('bad-id', TEST_IDS.USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when deleting another users file', async () => {
      const attachment = mockAttachment({ uploadedBy: 'other-user-id' });
      attachmentRepo.findOne.mockResolvedValue(attachment);

      await expect(service.delete(TEST_IDS.ATTACHMENT_ID, TEST_IDS.USER_ID)).rejects.toThrow(ForbiddenException);
      await expect(service.delete(TEST_IDS.ATTACHMENT_ID, TEST_IDS.USER_ID)).rejects.toThrow(
        'You can only delete your own files',
      );
    });
  });
});
