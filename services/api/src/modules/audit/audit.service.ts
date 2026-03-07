import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(
    orgId: string,
    userId: string | null,
    action: string,
    entityType: string,
    entityId?: string,
    changes?: any,
    ipAddress?: string,
  ): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      orgId,
      userId: userId || null,
      action,
      entityType,
      entityId: entityId || null,
      changes: changes || {},
      ipAddress: ipAddress || null,
    });
    return this.auditLogRepository.save(auditLog);
  }

  async findAll(
    orgId: string,
    filters: {
      entityType?: string;
      action?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
    },
    page = 1,
    limit = 20,
  ): Promise<{ items: AuditLog[]; total: number; page: number; limit: number }> {
    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .where('audit.organization_id = :orgId', { orgId });

    if (filters.entityType) {
      qb.andWhere('audit.entity_type = :entityType', { entityType: filters.entityType });
    }
    if (filters.action) {
      qb.andWhere('audit.action = :action', { action: filters.action });
    }
    if (filters.userId) {
      qb.andWhere('audit.user_id = :userId', { userId: filters.userId });
    }
    if (filters.startDate) {
      qb.andWhere('audit.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters.endDate) {
      qb.andWhere('audit.created_at <= :endDate', { endDate: filters.endDate });
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('audit.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
  }
}
