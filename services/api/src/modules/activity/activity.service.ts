import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity, ActivityAction } from './entities/activity.entity';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
  ) {}

  async log(
    orgId: string,
    issueId: string,
    userId: string,
    action: string,
    field?: string,
    oldValue?: string,
    newValue?: string,
    metadata?: any,
  ): Promise<Activity> {
    const activity = this.activityRepository.create({
      organizationId: orgId,
      issueId,
      userId,
      action: action as ActivityAction,
      field: field || null,
      oldValue: oldValue || null,
      newValue: newValue || null,
      metadata: metadata || null,
    });
    return this.activityRepository.save(activity as Activity);
  }

  async findByIssue(
    issueId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: Activity[]; total: number; page: number; limit: number }> {
    const [items, total] = await this.activityRepository.findAndCount({
      where: { issueId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }
}
