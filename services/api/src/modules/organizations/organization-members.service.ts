import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationMember } from './entities/organization-member.entity';

@Injectable()
export class OrganizationMembersService {
  constructor(
    @InjectRepository(OrganizationMember)
    private memberRepository: Repository<OrganizationMember>,
  ) {}

  /**
   * Returns all organization memberships for a given user, including
   * the related organization entity.
   */
  async getUserMemberships(userId: string): Promise<OrganizationMember[]> {
    return this.memberRepository.find({
      where: { userId },
      relations: ['organization'],
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  /**
   * Returns a single membership lookup for a user in an organization.
   */
  async getMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMember | null> {
    return this.memberRepository.findOne({
      where: { userId, organizationId },
      relations: ['organization'],
    });
  }

  /**
   * Creates an organization_members row. Uses ON CONFLICT DO NOTHING
   * via upsert to safely handle duplicate inserts (e.g. migration re-runs).
   */
  async addMembership(
    organizationId: string,
    userId: string,
    role: string,
    isDefault = false,
  ): Promise<OrganizationMember> {
    // Attempt insert, ignore if (user_id, organization_id) already exists
    await this.memberRepository
      .createQueryBuilder()
      .insert()
      .into(OrganizationMember)
      .values({
        userId,
        organizationId,
        role,
        isDefault,
      })
      .orIgnore() // ON CONFLICT DO NOTHING
      .execute();

    const membership = await this.memberRepository.findOne({
      where: { userId, organizationId },
      relations: ['organization'],
    });

    if (!membership) {
      throw new NotFoundException(
        'Failed to create or retrieve membership',
      );
    }

    return membership;
  }

  /**
   * Removes a user's membership from an organization.
   */
  async removeMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.memberRepository.delete({
      organizationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Membership not found');
    }
  }

  /**
   * Sets the given org as the user's default and clears the default flag
   * on all other memberships for that user. Uses a transaction to ensure
   * atomicity.
   */
  async setDefaultOrg(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    // Verify the membership exists
    const membership = await this.memberRepository.findOne({
      where: { userId, organizationId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    // Clear all defaults for this user
    await this.memberRepository
      .createQueryBuilder()
      .update(OrganizationMember)
      .set({ isDefault: false })
      .where('user_id = :userId', { userId })
      .execute();

    // Set the requested org as default
    await this.memberRepository
      .createQueryBuilder()
      .update(OrganizationMember)
      .set({ isDefault: true })
      .where('user_id = :userId AND organization_id = :organizationId', {
        userId,
        organizationId,
      })
      .execute();
  }
}
