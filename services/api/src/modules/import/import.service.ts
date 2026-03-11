import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { JiraMapperService, JiraExport, ImportPreview } from './jira-mapper.service';
import { StartImportDto } from './dto/import-jira.dto';
import IORedis from 'ioredis';

export interface ImportStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  errors: string[];
  startedAt?: string;
  completedAt?: string;
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);
  private readonly uploadDir = '/tmp/imports';
  private redisClient: IORedis | null = null;

  constructor(
    @InjectQueue('import')
    private importQueue: Queue,
    private jiraMapperService: JiraMapperService,
    private configService: ConfigService,
  ) {
    this.ensureUploadDir();
    this.initRedis();
  }

  private ensureUploadDir(): void {
    try {
      if (!fs.existsSync(this.uploadDir)) {
        fs.mkdirSync(this.uploadDir, { recursive: true });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to create upload directory: ${err.message}`);
    }
  }

  private initRedis(): void {
    try {
      const redisUrl = this.configService.get<string>('redis.url');
      if (redisUrl) {
        try {
          const url = new URL(redisUrl);
          this.redisClient = new IORedis({
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            maxRetriesPerRequest: 3,
          });
        } catch {
          // fall through
        }
      }

      if (!this.redisClient) {
        this.redisClient = new IORedis({
          host: this.configService.get<string>('redis.host') || 'localhost',
          port: this.configService.get<number>('redis.port') || 6379,
          maxRetriesPerRequest: 3,
        });
      }
    } catch (err: any) {
      this.logger.warn(`Failed to initialize Redis client for import status: ${err.message}`);
    }
  }

  /**
   * Save an uploaded file to the temp imports directory.
   * Returns the file path.
   */
  async uploadFile(file: Express.Multer.File): Promise<string> {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    const ext = path.extname(file.originalname || '.json').toLowerCase();
    if (ext !== '.json') {
      throw new BadRequestException('Only JSON files are supported');
    }

    const fileName = `${uuidv4()}${ext}`;
    const filePath = path.join(this.uploadDir, fileName);

    try {
      fs.writeFileSync(filePath, file.buffer);
    } catch (err: any) {
      throw new BadRequestException(`Failed to save file: ${err.message}`);
    }

    return filePath;
  }

  /**
   * Parse the uploaded JSON file and return a preview summary.
   */
  async previewImport(
    filePath: string,
    organizationId: string,
  ): Promise<ImportPreview> {
    const data = this.readAndParseFile(filePath);
    return this.jiraMapperService.buildPreview(data, organizationId);
  }

  /**
   * Enqueue a BullMQ job to process the Jira import asynchronously.
   * Returns the job ID.
   */
  async startImport(
    dto: StartImportDto,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    // Validate the file exists and is parseable
    this.readAndParseFile(dto.filePath);

    const jobId = uuidv4();

    // Set initial status in Redis
    const initialStatus: ImportStatus = {
      status: 'pending',
      total: 0,
      processed: 0,
      errors: [],
      startedAt: new Date().toISOString(),
    };

    if (this.redisClient) {
      try {
        await this.redisClient.set(
          `import:${jobId}`,
          JSON.stringify(initialStatus),
          'EX',
          86400, // 24h TTL
        );
      } catch (err: any) {
        this.logger.warn(`Failed to set initial import status in Redis: ${err.message}`);
      }
    }

    await this.importQueue.add(
      'jira-import',
      {
        jobId,
        filePath: dto.filePath,
        organizationId,
        userId,
        targetProjectId: dto.targetProjectId || null,
        userMapping: dto.userMapping || {},
      },
      {
        jobId,
        attempts: 1, // Don't retry imports — they're not idempotent
        removeOnComplete: { age: 86400 },
        removeOnFail: { age: 86400 },
      },
    );

    this.logger.log(`Import job ${jobId} enqueued for org ${organizationId}`);
    return jobId;
  }

  /**
   * Read the import status from Redis.
   */
  async getImportStatus(jobId: string): Promise<ImportStatus> {
    if (!this.redisClient) {
      throw new NotFoundException('Redis not available for status tracking');
    }

    try {
      const raw = await this.redisClient.get(`import:${jobId}`);
      if (!raw) {
        throw new NotFoundException(`Import job ${jobId} not found`);
      }
      return JSON.parse(raw) as ImportStatus;
    } catch (err: any) {
      if (err instanceof NotFoundException) throw err;
      throw new NotFoundException(`Import job ${jobId} not found`);
    }
  }

  /**
   * Read and parse a Jira JSON export file from disk.
   */
  private readAndParseFile(filePath: string): JiraExport {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new BadRequestException('File not found. Please upload a file first.');
    }

    // Security: ensure the file is within the expected directory
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(this.uploadDir)) {
      throw new BadRequestException('Invalid file path');
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return this.jiraMapperService.parseExport(parsed);
    } catch (err: any) {
      if (err.message?.includes('Invalid Jira export')) {
        throw new BadRequestException(err.message);
      }
      throw new BadRequestException(`Failed to parse JSON file: ${err.message}`);
    }
  }
}
