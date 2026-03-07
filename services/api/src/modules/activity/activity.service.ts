import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Activity, ActivityAction } from './entities/activity.entity';

export interface LogActivityParams {
  organizationId: string;
  issueId: string;
  userId: string;
  action: ActivityAction;
  field?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
  ) {}

  async log(params: LogActivityParams): Promise<Activity> {
    const activity = this.activityRepository.create({
      organizationId: params.organizationId,
      issueId: params.issueId,
      userId: params.userId,
      action: params.action,
      field: params.field || null,
      oldValue: params.oldValue || null,
      newValue: params.newValue || null,
      metadata: params.metadata || null,
    });
    return this.activityRepository.save(activity);
  }

  async logMany(entries: LogActivityParams[]): Promise<Activity[]> {
    const activities = entries.map((params) =>
      this.activityRepository.create({
        organizationId: params.organizationId,
        issueId: params.issueId,
        userId: params.userId,
        action: params.action,
        field: params.field || null,
        oldValue: params.oldValue || null,
        newValue: params.newValue || null,
        metadata: params.metadata || null,
      }),
    );
    return this.activityRepository.save(activities);
  }

  async findByIssue(
    issueId: string,
    pagination: { page?: number; limit?: number } = {},
  ): Promise<{ items: Activity[]; total: number; page: number; limit: number }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 50;

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
