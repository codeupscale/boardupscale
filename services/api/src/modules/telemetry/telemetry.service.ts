import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../users/entities/user.entity';

/**
 * TelemetryService
 *
 * Sends a single anonymous ping to the Boardupscale telemetry endpoint on
 * startup.  No personally identifiable information is ever transmitted.
 *
 * Payload (all fields are anonymous):
 *   - installationId : stable SHA-256 hash derived from the oldest org ID
 *   - version        : npm package version
 *   - nodeVersion    : Node.js runtime version
 *   - platform       : os platform (linux / darwin / win32)
 *   - orgCount       : total number of organisations
 *   - userCount      : total number of active users
 *
 * Opt out by setting TELEMETRY_ENABLED=false in your environment.
 */
@Injectable()
export class TelemetryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelemetryService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.configService.get<boolean>('telemetry.enabled');
    if (!enabled) {
      this.logger.log('Telemetry is disabled (TELEMETRY_ENABLED=false)');
      return;
    }

    // Fire-and-forget — never block startup or throw to the caller.
    this.sendPing().catch((err) => {
      this.logger.debug(`Telemetry ping failed (non-fatal): ${err.message}`);
    });
  }

  private async sendPing(): Promise<void> {
    const endpoint = this.configService.get<string>('telemetry.endpoint');

    const [orgCount, userCount, oldestOrg] = await Promise.all([
      this.orgRepo.count(),
      this.userRepo.count({ where: { isActive: true } }),
      this.orgRepo.findOne({ order: { createdAt: 'ASC' } }),
    ]);

    // Derive a stable, anonymous installation ID from the oldest org's UUID.
    // The hash is one-way — we cannot reverse-engineer the org ID from it.
    const installationId = oldestOrg
      ? createHash('sha256').update(oldestOrg.id).digest('hex').slice(0, 16)
      : randomUUID().replace(/-/g, '').slice(0, 16);

    const payload = JSON.stringify({
      installationId,
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      platform: process.platform,
      orgCount,
      userCount,
    });

    await this.httpPost(endpoint, payload);
    this.logger.debug(`Telemetry ping sent (installationId=${installationId})`);
  }

  private httpPost(url: string, body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const transport = parsed.protocol === 'https:' ? https : http;

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': `Boardupscale/${process.env.npm_package_version || '1.0.0'}`,
          },
          timeout: 5000,
        },
        (res) => {
          // Drain the response so the socket can be reused.
          res.resume();
          resolve();
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Telemetry request timed out'));
      });

      req.write(body);
      req.end();
    });
  }
}
