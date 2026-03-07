import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface LogAuditParams {
  organizationId: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  changes?: Record<string, any>;
  ipAddress?: string;
}

export interface AuditLogFilters {
  organizationId: string;
  entityType?: string;
  action?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogRepository: Repository<AuditLog>,
  ) {}

  async log(params: LogAuditParams): Promise<AuditLog> {
    const auditLog = this.auditLogRepository.create({
      organizationId: params.organizationId,
      userId: params.userId || null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId || null,
      changes: params.changes || {},
      ipAddress: params.ipAddress || null,
    });
    return this.auditLogRepository.save(auditLog);
  }

  async findAll(filters: AuditLogFilters): Promise<{
    items: AuditLog[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 25;

    const qb = this.auditLogRepository
      .createQueryBuilder('audit')
      .leftJoinAndSelect('audit.user', 'user')
      .where('audit.organization_id = :organizationId', {
        organizationId: filters.organizationId,
      });

    if (filters.entityType) {
      qb.andWhere('audit.entity_type = :entityType', {
        entityType: filters.entityType,
      });
    }

    if (filters.action) {
      qb.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters.userId) {
      qb.andWhere('audit.user_id = :userId', { userId: filters.userId });
    }

    if (filters.startDate) {
      qb.andWhere('audit.created_at >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }

    if (filters.endDate) {
      qb.andWhere('audit.created_at <= :endDate', {
        endDate: new Date(filters.endDate),
      });
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
