import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationsService } from './organizations.service';
import { Organization } from './entities/organization.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../notifications/email.service';
import { AuditService } from '../audit/audit.service';
import { createMockRepository } from '../../test/test-utils';
import { mockOrganization, mockUser, TEST_IDS } from '../../test/mock-factories';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  const mockEmailService = { sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
  const mockAuditService = { log: jest.fn() };
  const mockConfigService = { get: jest.fn().mockReturnValue('http://localhost:3000') };

  beforeEach(async () => {
    orgRepo = createMockRepository();
    userRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return organization by id', async () => {
      const org = mockOrganization();
      orgRepo.findOne.mockResolvedValue(org);

      const result = await service.findById(TEST_IDS.ORG_ID);

      expect(result).toEqual(org);
      expect(orgRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_IDS.ORG_ID } });
    });

    it('should throw NotFoundException when organization not found', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('non-existent')).rejects.toThrow('Organization not found');
    });
  });

  describe('update', () => {
    it('should update organization fields', async () => {
      const org = mockOrganization();
      const updatedOrg = mockOrganization({ name: 'Updated Org' });
      orgRepo.findOne.mockResolvedValue(org);
      orgRepo.save.mockResolvedValue(updatedOrg);

      const result = await service.update(TEST_IDS.ORG_ID, { name: 'Updated Org' });

      expect(result).toEqual(updatedOrg);
      expect(orgRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when org not found during update', async () => {
      orgRepo.findOne.mockResolvedValue(null);

      await expect(service.update('bad-id', { name: 'test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMembers', () => {
    it('should return all members for the organization', async () => {
      const users = [
        mockUser(),
        mockUser({ id: 'other-user', email: 'other@example.com', displayName: 'Other' }),
      ];
      userRepo.find.mockResolvedValue(users);

      const result = await service.getMembers(TEST_IDS.ORG_ID);

      expect(result).toEqual(users);
      expect(userRepo.find).toHaveBeenCalledWith({
        where: { organizationId: TEST_IDS.ORG_ID },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('inviteMember', () => {
    const inviterId = TEST_IDS.USER_ID;

    it('should create a new user for the organization', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(mockUser({ id: inviterId })) // inviter lookup
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      const newUser = mockUser({ email: 'invited@example.com', role: 'member', isActive: false });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);

      const result = await service.inviteMember(TEST_IDS.ORG_ID, {
        email: 'invited@example.com',
        role: 'member',
      }, inviterId);

      expect(result).toEqual(newUser);
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: TEST_IDS.ORG_ID,
          email: 'invited@example.com',
          role: 'member',
          isActive: false,
          emailVerified: false,
          passwordHash: null,
        }),
      );
      expect(mockEmailService.sendInvitationEmail).toHaveBeenCalled();
    });

    it('should throw ConflictException when user is already a member of the same org', async () => {
      const existingUser = mockUser({ organizationId: TEST_IDS.ORG_ID });
      userRepo.findOne.mockResolvedValue(existingUser);

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('should throw ConflictException when email is registered in another org', async () => {
      const existingUser = mockUser({ organizationId: 'other-org-id' });
      userRepo.findOne.mockResolvedValue(existingUser);

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow('Email is already registered in another organization');
    });

    it('should default role to member when not specified', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUser({ id: inviterId }));
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      const newUser = mockUser({ role: 'member' });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);

      await service.inviteMember(TEST_IDS.ORG_ID, { email: 'new@example.com' }, inviterId);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'member' }),
      );
    });
  });

  describe('deactivateMember', () => {
    it('should prevent self-deactivation', async () => {
      await expect(
        service.deactivateMember(TEST_IDS.ORG_ID, TEST_IDS.USER_ID, TEST_IDS.USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should deactivate a member', async () => {
      const member = mockUser({ id: 'other-user', role: 'member' });
      userRepo.findOne.mockResolvedValue(member);
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.deactivateMember(TEST_IDS.ORG_ID, 'other-user', TEST_IDS.USER_ID);

      expect(userRepo.update).toHaveBeenCalledWith('other-user', { isActive: false });
    });
  });
});
