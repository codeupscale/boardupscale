import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Organization } from './entities/organization.entity';
import { User } from '../users/entities/user.entity';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<Organization> {
    const org = await this.organizationRepository.findOne({ where: { id } });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    Object.assign(org, dto);
    return this.organizationRepository.save(org);
  }

  async getMembers(organizationId: string): Promise<User[]> {
    return this.userRepository.find({
      where: { organizationId },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteMember(organizationId: string, dto: InviteMemberDto): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      if (existingUser.organizationId === organizationId) {
        throw new ConflictException('User is already a member of this organization');
      }
      throw new ConflictException('Email is already registered in another organization');
    }

    const tempPassword = Math.random().toString(36).slice(-10);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = this.userRepository.create({
      organizationId,
      email: dto.email,
      displayName: dto.email.split('@')[0],
      passwordHash,
      role: dto.role || 'member',
      isActive: false,
      emailVerified: false,
    });

    return this.userRepository.save(user);
  }
}
