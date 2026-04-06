import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { createMockRepository, createMockQueryBuilder, mockUpdateResult } from '../../test/test-utils';
import { mockUser, TEST_IDS } from '../../test/mock-factories';

jest.mock('bcryptjs');

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: ReturnType<typeof createMockRepository>;

  beforeEach(async () => {
    userRepo = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.findById(TEST_IDS.USER_ID);

      expect(result).toEqual(user);
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { id: TEST_IDS.USER_ID } });
    });

    it('should throw NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent-id')).rejects.toThrow(NotFoundException);
      await expect(service.findById('non-existent-id')).rejects.toThrow('User not found');
    });
  });

  describe('findByEmail', () => {
    it('should return user by email', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(user);
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
    });

    it('should return null when email not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByOrg', () => {
    it('should return active users for organization (paginated)', async () => {
      const users = [mockUser(), mockUser({ id: 'other-user-id', email: 'other@example.com' })];
      const qb = createMockQueryBuilder(users);
      // Service calls getCount() then getMany() separately
      qb.getCount.mockResolvedValue(users.length);
      qb.getMany.mockResolvedValue(users);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.findByOrg(TEST_IDS.ORG_ID);

      expect(result).toEqual({
        items: users,
        total: users.length,
        page: 1,
        limit: 20,
      });
      expect(qb.where).toHaveBeenCalledWith(
        'user.organizationId = :organizationId',
        { organizationId: TEST_IDS.ORG_ID },
      );
      expect(qb.andWhere).toHaveBeenCalledWith('user.isActive = true');
    });
  });

  describe('create', () => {
    it('should create and return a new user', async () => {
      userRepo.findOne.mockResolvedValue(null); // findByEmail returns null
      const user = mockUser();
      userRepo.create.mockReturnValue(user);
      userRepo.save.mockResolvedValue(user);

      const result = await service.create({
        organizationId: TEST_IDS.ORG_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
        role: 'member',
      });

      expect(result).toEqual(user);
      expect(userRepo.create).toHaveBeenCalledWith({
        organizationId: TEST_IDS.ORG_ID,
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: 'hashed-password',
        role: 'member',
        isActive: true,
        emailVerified: false,
      });
    });

    it('should throw ConflictException when email already in use', async () => {
      userRepo.findOne.mockResolvedValue(mockUser()); // findByEmail returns existing

      await expect(
        service.create({
          organizationId: TEST_IDS.ORG_ID,
          email: 'test@example.com',
          displayName: 'Test User',
          passwordHash: 'hashed',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should default role to owner when not provided', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const user = mockUser({ role: 'owner' });
      userRepo.create.mockReturnValue(user);
      userRepo.save.mockResolvedValue(user);

      await service.create({
        organizationId: TEST_IDS.ORG_ID,
        email: 'test@example.com',
        displayName: 'Test',
        passwordHash: 'hashed',
      });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'owner' }),
      );
    });
  });

  describe('update', () => {
    it('should update user fields and return wrapped result', async () => {
      const user = mockUser();
      const updatedUser = mockUser({ displayName: 'Updated Name' });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockResolvedValue(updatedUser);

      const result = await service.update(TEST_IDS.USER_ID, { displayName: 'Updated Name' });

      expect(result).toEqual({ data: updatedUser });
      expect(userRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', { displayName: 'test' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePassword', () => {
    it('should change password when current password is correct', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');
      userRepo.update.mockResolvedValue(mockUpdateResult());

      await service.changePassword(TEST_IDS.USER_ID, 'oldPassword', 'newPassword');

      expect(bcrypt.compare).toHaveBeenCalledWith('oldPassword', user.passwordHash);
      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 12);
      expect(userRepo.update).toHaveBeenCalledWith(TEST_IDS.USER_ID, { passwordHash: 'new-hashed-password' });
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.changePassword(TEST_IDS.USER_ID, 'wrong', 'new')).rejects.toThrow(BadRequestException);
      await expect(service.changePassword(TEST_IDS.USER_ID, 'wrong', 'new')).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('updateLastLogin', () => {
    it('should update the lastLoginAt timestamp', async () => {
      userRepo.update.mockResolvedValue(mockUpdateResult());

      await service.updateLastLogin(TEST_IDS.USER_ID);

      expect(userRepo.update).toHaveBeenCalledWith(TEST_IDS.USER_ID, { lastLoginAt: expect.any(Date) });
    });
  });

  describe('deactivate', () => {
    it('should deactivate a user within their organization', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.update.mockResolvedValue(mockUpdateResult());

      await service.deactivate(TEST_IDS.USER_ID, TEST_IDS.ORG_ID);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: TEST_IDS.USER_ID, organizationId: TEST_IDS.ORG_ID },
      });
      expect(userRepo.update).toHaveBeenCalledWith(TEST_IDS.USER_ID, { isActive: false });
    });

    it('should throw NotFoundException when user not found in org', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.deactivate('bad-id', TEST_IDS.ORG_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
