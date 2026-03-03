import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { OrganizationsService } from './organizations.service';
import { Organization } from './entities/organization.entity';
import { User } from '../users/entities/user.entity';
import { createMockRepository } from '../../test/test-utils';
import { mockOrganization, mockUser, TEST_IDS } from '../../test/mock-factories';

jest.mock('bcryptjs');

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let orgRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    orgRepo = createMockRepository();
    userRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
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

    it('should update organization settings', async () => {
      const org = mockOrganization();
      const updatedOrg = mockOrganization({ settings: { theme: 'dark' } });
      orgRepo.findOne.mockResolvedValue(org);
      orgRepo.save.mockResolvedValue(updatedOrg);

      const result = await service.update(TEST_IDS.ORG_ID, { settings: { theme: 'dark' } });

      expect(result.settings).toEqual({ theme: 'dark' });
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
    it('should create a new user for the organization', async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp-password');
      const newUser = mockUser({ email: 'invited@example.com', role: 'member', isActive: false });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);

      const result = await service.inviteMember(TEST_IDS.ORG_ID, {
        email: 'invited@example.com',
        role: 'member',
      });

      expect(result).toEqual(newUser);
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: TEST_IDS.ORG_ID,
          email: 'invited@example.com',
          role: 'member',
          isActive: false,
          emailVerified: false,
        }),
      );
    });

    it('should throw ConflictException when user is already a member of the same org', async () => {
      const existingUser = mockUser({ organizationId: TEST_IDS.ORG_ID });
      userRepo.findOne.mockResolvedValue(existingUser);

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }),
      ).rejects.toThrow('User is already a member of this organization');
    });

    it('should throw ConflictException when email is registered in another org', async () => {
      const existingUser = mockUser({ organizationId: 'other-org-id' });
      userRepo.findOne.mockResolvedValue(existingUser);

      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.inviteMember(TEST_IDS.ORG_ID, { email: 'test@example.com' }),
      ).rejects.toThrow('Email is already registered in another organization');
    });

    it('should default role to member when not specified', async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      const newUser = mockUser({ role: 'member' });
      userRepo.create.mockReturnValue(newUser);
      userRepo.save.mockResolvedValue(newUser);

      await service.inviteMember(TEST_IDS.ORG_ID, { email: 'new@example.com' });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'member' }),
      );
    });
  });
});
