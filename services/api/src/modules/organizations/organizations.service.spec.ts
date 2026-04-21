import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationsService } from './organizations.service';
import { Organization } from './entities/organization.entity';
import { OrganizationMember } from './entities/organization-member.entity';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../notifications/email.service';
import { AuditService } from '../audit/audit.service';
import { PosthogService } from '../telemetry/posthog.service';
import { createMockRepository } from '../../test/test-utils';
import { mockOrganization, mockUser, TEST_IDS } from '../../test/mock-factories';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let orgMemberRepo: ReturnType<typeof createMockRepository>;
  const mockEmailService = { sendInvitationEmail: jest.fn().mockResolvedValue(undefined) };
  const mockAuditService = { log: jest.fn() };
  const mockConfigService = { get: jest.fn().mockReturnValue('http://localhost:3000') };
  const mockDataSource = {
    transaction: jest.fn((cb: any) => cb({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
    query: jest.fn(),
  };

  beforeEach(async () => {
    orgRepo = createMockRepository();
    userRepo = createMockRepository();
    orgMemberRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(OrganizationMember), useValue: orgMemberRepo },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: PosthogService, useValue: { identify: jest.fn(), capture: jest.fn(), shutdown: jest.fn() } },
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
      const user1 = mockUser();
      const user2 = mockUser({ id: 'other-user', email: 'other@example.com', displayName: 'Other' });
      const memberships = [
        { userId: user1.id, user: user1 },
        { userId: user2.id, user: user2 },
      ];
      orgMemberRepo.find.mockResolvedValue(memberships);
      userRepo.find.mockResolvedValue([]); // no legacy users

      const result = await service.getMembers(TEST_IDS.ORG_ID);

      expect(result).toEqual([user1, user2]);
      expect(orgMemberRepo.find).toHaveBeenCalledWith({
        where: { organizationId: TEST_IDS.ORG_ID },
        relations: ['user'],
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('inviteMember', () => {
    const inviterId = TEST_IDS.USER_ID;

    const mockOrgMemberQb = () => {
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      orgMemberRepo.createQueryBuilder.mockReturnValue(qb as any);
      return qb;
    };

    it('should create a new user for the organization', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(mockUser({ id: inviterId })) // inviter lookup (generateAndSendInvitation)
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      const newUser = mockUser({ email: 'invited@example.com', role: 'member', isActive: false });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);
      mockOrgMemberQb();

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
      // User exists AND has an existing membership in this org
      orgMemberRepo.findOne.mockResolvedValue({ userId: existingUser.id, organizationId: TEST_IDS.ORG_ID });

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId),
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('should add existing user from another org to this org', async () => {
      const existingUser = mockUser({ organizationId: 'other-org-id' });
      userRepo.findOne
        .mockResolvedValueOnce(existingUser) // email check
        .mockResolvedValueOnce(mockUser({ id: inviterId })); // inviter lookup
      orgMemberRepo.findOne.mockResolvedValue(null); // no existing membership
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      mockOrgMemberQb();

      const result = await service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }, inviterId);

      expect(result).toEqual(existingUser);
      expect(orgMemberRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockEmailService.sendInvitationEmail).toHaveBeenCalled();
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
      mockOrgMemberQb();

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
      orgMemberRepo.findOne.mockResolvedValue({ userId: 'other-user', organizationId: TEST_IDS.ORG_ID });
      userRepo.findOne.mockResolvedValue(member);
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.deactivateMember(TEST_IDS.ORG_ID, 'other-user', TEST_IDS.USER_ID);

      expect(userRepo.update).toHaveBeenCalledWith('other-user', { isActive: false });
    });
  });

  describe('repairOrgMemberships', () => {
    it('should run all four repair SQL statements and return counts', async () => {
      mockDataSource.query = jest.fn()
        .mockResolvedValueOnce({ rowCount: 2 }) // org_members repair
        .mockResolvedValueOnce({ rowCount: 3 }) // assignee project_members
        .mockResolvedValueOnce({ rowCount: 1 }) // reporter project_members
        .mockResolvedValueOnce({ rowCount: 0 }); // comment author project_members

      const result = await service.repairOrgMemberships(TEST_IDS.ORG_ID);

      expect(mockDataSource.query).toHaveBeenCalledTimes(4);
      expect(result).toEqual({ repairedOrgMembers: 2, repairedProjectMembers: 4 });
    });

    it('should return zeros when nothing needs repair', async () => {
      mockDataSource.query = jest.fn().mockResolvedValue({ rowCount: 0 });

      const result = await service.repairOrgMemberships(TEST_IDS.ORG_ID);

      expect(result).toEqual({ repairedOrgMembers: 0, repairedProjectMembers: 0 });
    });
  });
});
