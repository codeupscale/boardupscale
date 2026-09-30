import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { ApiKey } from './entities/api-key.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

export const MCP_TOKEN_PREFIX = 'bu_mcp_';
export const MCP_SCOPE_READ = 'mcp:read';
export const MCP_SCOPE_COMMENT = 'mcp:comment';
export const MCP_TOKEN_MAX_DAYS = 365;

/** True when the key is a personal MCP token (only valid on the /mcp endpoint). */
export function isMcpKey(scopes: string[] | null | undefined): boolean {
  return (scopes ?? []).some((s) => s.startsWith('mcp:'));
}

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    @InjectRepository(OrganizationMember)
    private orgMemberRepository: Repository<OrganizationMember>,
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
   * Create a personal MCP token for the calling user. MCP tokens always expire
   * and grant read + comment access only to what the user can already see.
   */
  async createMcpToken(
    userId: string,
    orgId: string,
    name: string,
    expiresInDays: number,
  ): Promise<{ apiKey: ApiKey; rawKey: string }> {
    const days = Math.min(Math.max(1, Math.floor(expiresInDays)), MCP_TOKEN_MAX_DAYS);
    const rawKey = this.generateRawKey(MCP_TOKEN_PREFIX);

    const apiKey = this.apiKeyRepository.create({
      userId,
      orgId,
      name,
      keyHash: this.hashKey(rawKey),
      keyPrefix: rawKey.substring(0, 10),
      scopes: [MCP_SCOPE_READ, MCP_SCOPE_COMMENT],
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    return { apiKey: saved, rawKey };
  }

  /**
   * List the calling user's active MCP tokens in the given organization.
   */
  async findMcpTokensByUser(userId: string, orgId: string): Promise<ApiKey[]> {
    const keys = await this.findAllByUser(userId, orgId);
    return keys.filter((k) => k.isActive && isMcpKey(k.scopes));
  }

  /**
   * Revoke one of the calling user's own MCP tokens.
   */
  async revokeOwnMcpToken(id: string, userId: string, orgId: string): Promise<void> {
    const key = await this.apiKeyRepository.findOne({
      where: { id, userId, orgId },
    });
    if (!key || !isMcpKey(key.scopes)) {
      throw new NotFoundException('Token not found');
    }
    key.isActive = false;
    await this.apiKeyRepository.save(key);
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

  /**
   * The key owner's role in the key's org (organization_members), mirroring
   * how AuthService derives the JWT role. users.role is only trusted for
   * legacy rows when the key's org is the user's default org — it describes
   * that org, not arbitrary others. Rejects keys whose owner has left the org.
   */
  async resolveOrgRole(apiKey: ApiKey): Promise<string> {
    const membership = await this.orgMemberRepository.findOne({
      where: { userId: apiKey.user.id, organizationId: apiKey.orgId },
      select: ['id', 'role'],
    });
    if (membership) return membership.role;

    if (apiKey.user.organizationId === apiKey.orgId && apiKey.user.role) {
      return apiKey.user.role;
    }

    throw new UnauthorizedException('API key owner is not a member of this organization');
  }

  private generateRawKey(prefix = 'pf_'): string {
    // Generate a 32-byte random key, encoded as base64url for safe header transport
    return prefix + crypto.randomBytes(32).toString('base64url');
  }

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey).digest('hex');
  }
}
