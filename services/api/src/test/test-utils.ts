import { Repository, SelectQueryBuilder, UpdateResult } from 'typeorm';

/**
 * Helper to create a properly typed mock UpdateResult.
 */
export function mockUpdateResult(affected = 1): UpdateResult {
  return { affected, raw: [], generatedMaps: [] } as UpdateResult;
}

/**
 * Creates a mock TypeORM repository with all common methods mocked.
 */
export function createMockRepository<T = any>(): jest.Mocked<Repository<T>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn(),
    merge: jest.fn(),
    preload: jest.fn(),
    insert: jest.fn(),
    upsert: jest.fn(),
    exist: jest.fn(),
    exists: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    softDelete: jest.fn(),
    softRemove: jest.fn(),
    restore: jest.fn(),
    recover: jest.fn(),
  } as any;
}

/**
 * Creates a mock QueryBuilder chain that can be configured with return values.
 */
export function createMockQueryBuilder<T = any>(result?: T | T[]): Record<string, jest.Mock> & jest.Mocked<SelectQueryBuilder<T>> {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(Array.isArray(result) ? result : []),
    getOne: jest.fn().mockResolvedValue(Array.isArray(result) ? result[0] : result),
    getManyAndCount: jest.fn().mockResolvedValue([Array.isArray(result) ? result : [], Array.isArray(result) ? result.length : 0]),
    getCount: jest.fn().mockResolvedValue(Array.isArray(result) ? result.length : 0),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue({ affected: 1 } as UpdateResult),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
  };
  return qb;
}

/**
 * Creates a mock user JWT payload as extracted by the JwtStrategy.
 */
export function mockJwtPayload(overrides?: Record<string, any>) {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'test@example.com',
    organizationId: '11111111-1111-1111-1111-111111111111',
    role: 'member',
    displayName: 'Test User',
    ...overrides,
  };
}

/**
 * Creates a mock EventsGateway for testing services that emit WebSocket events.
 */
export function createMockEventsGateway() {
  return {
    emitToOrg: jest.fn(),
    emitToUser: jest.fn(),
    emitToProject: jest.fn(),
    server: {
      to: jest.fn().mockReturnValue({
        emit: jest.fn(),
      }),
    },
  };
}

/**
 * Creates a mock NotificationsService.
 */
export function createMockNotificationsService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    getUnreadCount: jest.fn(),
    markRead: jest.fn(),
    markAllRead: jest.fn(),
  };
}

/**
 * Creates a mock ProjectsService.
 */
export function createMockProjectsService() {
  return {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    getMembers: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
    isMember: jest.fn(),
    getNextIssueNumber: jest.fn(),
  };
}

/**
 * Creates a mock ConfigService.
 */
export function createMockConfigService(values?: Record<string, any>) {
  const defaults: Record<string, any> = {
    'jwt.secret': 'test-jwt-secret',
    'jwt.expiry': '15m',
    'minio.endpoint': 'localhost',
    'minio.port': 9000,
    'minio.useSSL': false,
    'minio.accessKey': 'minioadmin',
    'minio.secretKey': 'minioadmin',
    'minio.bucket': 'projectflow',
    ...values,
  };

  return {
    get: jest.fn((key: string) => defaults[key]),
  };
}
