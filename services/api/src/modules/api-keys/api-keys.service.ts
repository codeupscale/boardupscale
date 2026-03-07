import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Create a new API key. Returns the raw key only once.
   */
  async create(
    userId: string,
    orgId: string,
    dto: CreateApiKeyDto,
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const rawKey = this.generateRawKey();
    const keyHash = this.hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 8);

    const apiKey = this.apiKeyRepository.create({
      userId,
      orgId,
      name: dto.name,
      keyHash,
      keyPrefix,
      scopes: dto.scopes || [],
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    return { apiKey: saved, rawKey };
  }

  /**
   * List all API keys for an organization.
   * The raw key is never returned after creation.
   */
  async findAllByOrg(orgId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { orgId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * List all API keys for a specific user.
   */
  async findAllByUser(userId: string, orgId: string): Promise<ApiKey[]> {
    return this.apiKeyRepository.find({
      where: { userId, orgId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke (deactivate) an API key.
   */
  async revoke(id: string, orgId: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({
      where: { id, orgId },
    });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    key.isActive = false;
    await this.apiKeyRepository.save(key);
  }

  /**
   * Validate a raw API key from the X-API-Key header.
   * Returns the associated user data if valid, or throws.
   */
  async validate(rawKey: string): Promise<ApiKey> {
    const keyHash = this.hashKey(rawKey);

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash, isActive: true },
      relations: ['user'],
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new UnauthorizedException('API key has expired');
    }

    if (!apiKey.user || !apiKey.user.isActive) {
      throw new UnauthorizedException('User associated with this API key is inactive');
    }

    // Update last used timestamp (fire-and-forget)
    this.apiKeyRepository.update(apiKey.id, { lastUsedAt: new Date() }).catch(() => {});

    return apiKey;
  }

  private generateRawKey(): string {
    // Generate a 32-byte random key, encoded as base64url for safe header transport
    return 'pf_' + crypto.randomBytes(32).toString('base64url');
  }

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
}
