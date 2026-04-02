import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JiraConnection } from './entities/jira-connection.entity';
import { JiraApiService, JiraApiCredentials } from './jira-api.service';
import { encrypt, decrypt } from './crypto.util';
import {
  SaveJiraConnectionDto,
  TestJiraConnectionDto,
} from './dto/jira-connection.dto';

export interface JiraConnectionSummary {
  id: string;
  jiraUrl: string;
  jiraEmail: string;
  isActive: boolean;
  lastTestedAt: Date | null;
  lastTestOk: boolean | null;
  createdAt: Date;
}

@Injectable()
export class JiraConnectionService {
  private readonly logger = new Logger(JiraConnectionService.name);

  constructor(
    @InjectRepository(JiraConnection)
    private connectionRepository: Repository<JiraConnection>,
    private jiraApiService: JiraApiService,
    private configService: ConfigService,
  ) {}

  private get appSecret(): string {
    const secret = this.configService.get<string>('app.secret') || process.env.APP_SECRET;
    if (!secret) {
      throw new Error('APP_SECRET is not configured — cannot encrypt Jira credentials');
    }
    return secret;
  }

  /**
   * Return the active Jira connection for an organisation (summary, no token).
   */
  async getConnection(
    organizationId: string,
  ): Promise<JiraConnectionSummary | null> {
    const conn = await this.connectionRepository.findOne({
      where: { organizationId, isActive: true },
    });

    if (!conn) return null;
    return this.toSummary(conn);
  }

  /**
   * Save (create or replace) a Jira connection for an organisation.
   * Encrypts the API token before persisting.
   */
  async saveConnection(
    dto: SaveJiraConnectionDto,
    organizationId: string,
    userId: string,
  ): Promise<JiraConnectionSummary> {
    // Normalise base URL — strip trailing slash, ensure https
    const jiraUrl = dto.jiraUrl.replace(/\/$/, '');

    // Encrypt the API token
    const apiTokenEnc = encrypt(dto.apiToken, this.appSecret);

    // Deactivate any existing connections for this org
    await this.connectionRepository.update(
      { organizationId },
      { isActive: false },
    );

    // Insert new connection
    const conn = this.connectionRepository.create({
      organizationId,
      createdById: userId,
      jiraUrl,
      jiraEmail: dto.jiraEmail.trim().toLowerCase(),
      apiTokenEnc,
      isActive: true,
    });

    const saved = await this.connectionRepository.save(conn);
    this.logger.log(
      `Saved Jira connection ${saved.id} for org ${organizationId}`,
    );

    return this.toSummary(saved);
  }

  /**
   * Test a Jira connection using the provided (not yet saved) credentials.
   * Does NOT persist anything.
   */
  async testConnectionDirect(
    dto: TestJiraConnectionDto,
  ): Promise<{ ok: boolean; displayName?: string; errorMessage?: string }> {
    const credentials: JiraApiCredentials = {
      baseUrl: dto.jiraUrl.replace(/\/$/, ''),
      email: dto.jiraEmail.trim(),
      apiToken: dto.apiToken,
    };

    return this.jiraApiService.testConnection(credentials);
  }

  /**
   * Test an already-saved connection (by connection ID).
   * Updates last_tested_at and last_test_ok in place.
   */
  async testSavedConnection(
    connectionId: string,
    organizationId: string,
  ): Promise<{ ok: boolean; displayName?: string; errorMessage?: string }> {
    const conn = await this.connectionRepository.findOne({
      where: { id: connectionId, organizationId },
      select: [
        'id',
        'organizationId',
        'jiraUrl',
        'jiraEmail',
        'apiTokenEnc',
        'isActive',
      ],
    });

    if (!conn) {
      throw new NotFoundException('Jira connection not found');
    }

    const apiToken = decrypt(conn.apiTokenEnc, this.appSecret);

    const result = await this.jiraApiService.testConnection({
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken,
    });

    // Persist test result
    await this.connectionRepository.update(conn.id, {
      lastTestedAt: new Date(),
      lastTestOk: result.ok,
    });

    return result;
  }

  /**
   * List Jira projects available via the saved connection.
   */
  async listProjects(
    connectionId: string,
    organizationId: string,
  ): Promise<Array<{ id: string; key: string; name: string; description?: string }>> {
    const credentials = await this.getDecryptedCredentials(
      connectionId,
      organizationId,
    );

    const projects = await this.jiraApiService.listProjects(credentials);
    return projects.map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
    }));
  }

  /**
   * Delete the active Jira connection for an organisation.
   */
  async deleteConnection(
    connectionId: string,
    organizationId: string,
  ): Promise<void> {
    const conn = await this.connectionRepository.findOne({
      where: { id: connectionId, organizationId },
    });

    if (!conn) {
      throw new NotFoundException('Jira connection not found');
    }

    await this.connectionRepository.remove(conn);
    this.logger.log(
      `Deleted Jira connection ${connectionId} for org ${organizationId}`,
    );
  }

  /**
   * Retrieve decrypted credentials for internal use (e.g. by the worker).
   * Never exposed via the API layer.
   */
  async getDecryptedCredentials(
    connectionId: string,
    organizationId: string,
  ): Promise<JiraApiCredentials> {
    const conn = await this.connectionRepository.findOne({
      where: { id: connectionId, organizationId, isActive: true },
      select: [
        'id',
        'organizationId',
        'jiraUrl',
        'jiraEmail',
        'apiTokenEnc',
        'isActive',
      ],
    });

    if (!conn) {
      throw new NotFoundException(
        'Active Jira connection not found for this organisation',
      );
    }

    const apiToken = decrypt(conn.apiTokenEnc, this.appSecret);

    return {
      baseUrl: conn.jiraUrl,
      email: conn.jiraEmail,
      apiToken,
    };
  }

  private toSummary(conn: JiraConnection): JiraConnectionSummary {
    return {
      id: conn.id,
      jiraUrl: conn.jiraUrl,
      jiraEmail: conn.jiraEmail,
      isActive: conn.isActive,
      lastTestedAt: conn.lastTestedAt ?? null,
      lastTestOk: conn.lastTestOk ?? null,
      createdAt: conn.createdAt,
    };
  }
}
