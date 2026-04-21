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
import { EventsGateway } from '../../websocket/events.gateway';
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
        { provide: EventsGateway, useValue: { emitToOrg: jest.fn() } },
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
      userRepo.find.mockResolvedValueOnce([]); // no synthetic placeholders
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
      userRepo.find.mockResolvedValueOnce([]); // no synthetic placeholders
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

    it('should return 409 JIRA_MERGE_REQUIRED when org has Jira placeholders and forceCreate is not set', async () => {
      const placeholder = mockUser({
        id: 'placeholder-id',
        email: 'jira-abc@migrated.jira.local',
        displayName: 'Shujaat Ali',
      });

      // No user exists with the invited email
      userRepo.findOne.mockResolvedValueOnce(null);
      // Synthetic placeholders exist in the org
      userRepo.find.mockResolvedValueOnce([placeholder]);

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'shujaat@example.com', role: 'member' }, inviterId),
      ).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'JIRA_MERGE_REQUIRED' }),
      });
    });

    it('should create a new user when forceCreate is true even with Jira placeholders', async () => {
      const placeholder = mockUser({
        id: 'placeholder-id',
        email: 'jira-abc@migrated.jira.local',
        displayName: 'Shujaat Ali',
      });

      userRepo.findOne
        .mockResolvedValueOnce(null)   // email check — no existing user
        .mockResolvedValueOnce(mockUser({ id: inviterId })); // inviter lookup in generateAndSendInvitation
      userRepo.find.mockResolvedValueOnce([placeholder]); // synthetic placeholders
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      const newUser = mockUser({ email: 'shujaat@example.com', isActive: false });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      orgMemberRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.inviteMember(
        TEST_IDS.ORG_ID,
        { email: 'shujaat@example.com', role: 'member', forceCreate: true },
        inviterId,
      );

      expect(result).toEqual(newUser);
      expect(userRepo.create).toHaveBeenCalled();
    });

    it('should proceed normally when no Jira placeholders exist', async () => {
      userRepo.findOne
        .mockResolvedValueOnce(null)  // email check
        .mockResolvedValueOnce(mockUser({ id: inviterId })); // inviter
      userRepo.find.mockResolvedValueOnce([]); // no synthetic placeholders
      orgRepo.findOne.mockResolvedValue(mockOrganization());
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      const newUser = mockUser({ email: 'fresh@example.com', isActive: false });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      orgMemberRepo.createQueryBuilder.mockReturnValue(qb as any);

      const result = await service.inviteMember(
        TEST_IDS.ORG_ID,
        { email: 'fresh@example.com', role: 'member' },
        inviterId,
      );

      expect(result).toEqual(newUser);
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
      const membership = { userId: 'other-user', organizationId: TEST_IDS.ORG_ID };
      orgMemberRepo.findOne.mockResolvedValue(membership);
      orgMemberRepo.remove.mockResolvedValue(membership);
      // No remaining memberships after removal → user account disabled
      orgMemberRepo.count.mockResolvedValue(0);
      userRepo.findOne.mockResolvedValue(member);
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });

      await service.deactivateMember(TEST_IDS.ORG_ID, 'other-user', TEST_IDS.USER_ID);

      expect(orgMemberRepo.remove).toHaveBeenCalledWith(membership);
      expect(userRepo.update).toHaveBeenCalledWith('other-user', { isActive: false });
    });

    it('should not disable login if member belongs to another org', async () => {
      const member = mockUser({ id: 'other-user', role: 'member' });
      const membership = { userId: 'other-user', organizationId: TEST_IDS.ORG_ID };
      orgMemberRepo.findOne.mockResolvedValue(membership);
      orgMemberRepo.remove.mockResolvedValue(membership);
      // Still has membership in another org
      orgMemberRepo.count.mockResolvedValue(1);
      userRepo.findOne.mockResolvedValue(member);

      await service.deactivateMember(TEST_IDS.ORG_ID, 'other-user', TEST_IDS.USER_ID);

      expect(orgMemberRepo.remove).toHaveBeenCalledWith(membership);
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('repairOrgMemberships', () => {
    it('should run all four repair SQL statements and return counts', async () => {
      // Steps 2a/2b/3 run first (project_members), then Step 1 (org_members) runs last
      // so that org_members backfill covers users added by the project_members inserts.
      mockDataSource.query = jest.fn()
        .mockResolvedValueOnce({ rowCount: 3 }) // Step 2a: assignee project_members
        .mockResolvedValueOnce({ rowCount: 1 }) // Step 2b: reporter project_members
        .mockResolvedValueOnce({ rowCount: 0 }) // Step 3: comment author project_members
        .mockResolvedValueOnce({ rowCount: 2 }); // Step 1 (last): org_members backfill

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

  describe('bulkInvitePending', () => {
    it('should send invitations to users with pending status and no valid token', async () => {
      const pendingUser1 = mockUser({
        id: 'pending-1',
        email: 'p1@example.com',
        invitationStatus: 'pending',
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      });
      const pendingUser2 = mockUser({
        id: 'pending-2',
        email: 'p2@example.com',
        invitationStatus: 'pending',
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      });

      userRepo.find.mockResolvedValue([pendingUser1, pendingUser2]);
      userRepo.update.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      userRepo.findOne
        .mockResolvedValueOnce(mockUser({ id: 'inviter-id' })) // inviter lookup for user1
        .mockResolvedValueOnce(mockUser({ id: 'inviter-id' })); // inviter lookup for user2
      orgRepo.findOne.mockResolvedValue(mockOrganization());

      const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

      expect(result).toEqual({ sent: 2, skipped: 0 });
      expect(mockEmailService.sendInvitationEmail).toHaveBeenCalledTimes(2);
    });

    it('should skip users who already have a valid non-expired token', async () => {
      const futureExpiry = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h from now
      const alreadyInvited = mockUser({
        id: 'already-invited',
        email: 'invited@example.com',
        invitationStatus: 'pending',
        emailVerificationToken: 'existing-hash',
        emailVerificationExpiry: futureExpiry,
      });

      userRepo.find.mockResolvedValue([alreadyInvited]);

      const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

      expect(result).toEqual({ sent: 0, skipped: 1 });
      expect(mockEmailService.sendInvitationEmail).not.toHaveBeenCalled();
    });

    it('should return zeros when no pending users exist', async () => {
      userRepo.find.mockResolvedValue([]);

      const result = await service.bulkInvitePending(TEST_IDS.ORG_ID);

      expect(result).toEqual({ sent: 0, skipped: 0 });
    });
  });

  describe('getJiraOrphans', () => {
    it('should return synthetic placeholder users with project count', async () => {
      const orphanRows = [
        {
          id: 'orphan-1',
          displayName: 'Shujaat Ali',
          email: 'jira-abc123@migrated.jira.local',
          jiraAccountId: 'abc123',
          invitationStatus: 'none',
          projectCount: 3,
        },
      ];
      mockDataSource.query = jest.fn().mockResolvedValue(orphanRows);

      const result = await service.getJiraOrphans(TEST_IDS.ORG_ID);

      expect(mockDataSource.query).toHaveBeenCalledTimes(1);
      expect(result).toEqual(orphanRows);
      expect(result[0].projectCount).toBe(3);
    });

    it('should return empty array when no orphans exist', async () => {
      mockDataSource.query = jest.fn().mockResolvedValue([]);

      const result = await service.getJiraOrphans(TEST_IDS.ORG_ID);

      expect(result).toEqual([]);
    });
  });
});
