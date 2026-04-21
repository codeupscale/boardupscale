import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { v4 as uuidv4 } from 'uuid';
import { Attachment } from './entities/attachment.entity';
import { UploadFileDto } from './dto/upload-file.dto';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;   // 50 MB
const PRESIGN_EXPIRES_SECONDS = 10 * 60;     // 10 min to complete the PUT

@Injectable()
export class FilesService {
  /** S3 client that talks server-to-storage (internal Docker network). */
  private s3Client: S3Client;
  /**
   * S3 client whose endpoint is the PUBLIC URL. Used ONLY for signing
   * presigned URLs so the browser gets a reachable hostname. Falls back
   * to `s3Client` when no public endpoint is configured.
   */
  private signerClient: S3Client;
  private bucket: string;
  private bucketReady = false;

  constructor(
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    private configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>('minio.endpoint');
    const port = this.configService.get<number>('minio.port');
    const useSSL = this.configService.get<boolean>('minio.useSSL');
    const internalEndpoint = `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`;

    const credentials = {
      accessKeyId: this.configService.get<string>('minio.accessKey'),
      secretAccessKey: this.configService.get<string>('minio.secretKey'),
    };

    this.s3Client = new S3Client({
      endpoint: internalEndpoint,
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      credentials,
      forcePathStyle: this.configService.get<boolean>('minio.forcePathStyle'),
      maxAttempts: 3,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5_000,
        requestTimeout: 60_000,
      }),
    });

    const publicEndpoint = this.configService.get<string>('minio.publicEndpoint');
    this.signerClient = publicEndpoint
      ? new S3Client({
          endpoint: publicEndpoint,
          region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
          credentials,
          forcePathStyle: this.configService.get<boolean>('minio.forcePathStyle'),
        })
      : this.s3Client;

    this.bucket = this.configService.get<string>('minio.bucket');
  }

  private async ensureBucket(): Promise<void> {
    if (this.bucketReady) return;
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    this.bucketReady = true;
  }

  // ── Presigned upload flow (direct browser → storage, no bytes through API) ──

  /**
   * Issues a presigned PUT URL the browser uploads directly to.
   * The API never sees the file bytes.
   */
  async presignUpload(dto: PresignUploadDto): Promise<{
    url: string;
    storageKey: string;
    storageBucket: string;
    headers: Record<string, string>;
    expiresIn: number;
  }> {
    if (dto.fileSize > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit`,
      );
    }

    await this.ensureBucket();

    const storageKey = `${uuidv4()}-${this.sanitizeFileName(dto.fileName)}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: dto.mimeType,
      ContentLength: dto.fileSize,
    });

    const url = await getSignedUrl(this.signerClient, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });

    return {
      url,
      storageKey,
      storageBucket: this.bucket,
      headers: {
        'Content-Type': dto.mimeType,
      },
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    };
  }

  /**
   * Confirms an upload that the client already PUT to the presigned URL.
   * Verifies the object exists, reads authoritative size from S3, and creates
   * the Attachment row. storage_bucket is constrained to this service's
   * bucket to prevent key-guessing into other buckets.
   */
  async confirmUpload(dto: ConfirmUploadDto, userId: string): Promise<Attachment> {
    if (dto.storageBucket !== this.bucket) {
      throw new BadRequestException('Invalid storageBucket');
    }

    // HEAD the object — confirms it exists and gives us authoritative size.
    let actualSize: number;
    try {
      const head = await this.s3Client.send(
        new HeadObjectCommand({ Bucket: dto.storageBucket, Key: dto.storageKey }),
      );
      actualSize = Number(head.ContentLength ?? 0);
    } catch {
      throw new BadRequestException(
        'Upload not found — did the PUT complete within the URL expiry?',
      );
    }

    if (actualSize <= 0 || actualSize > MAX_UPLOAD_BYTES) {
      // Reject absurd / empty uploads; also delete orphan object.
      await this.s3Client
        .send(new DeleteObjectCommand({ Bucket: dto.storageBucket, Key: dto.storageKey }))
        .catch(() => undefined);
      throw new BadRequestException('Uploaded file has invalid size');
    }

    const attachment = this.attachmentRepository.create({
      issueId: dto.issueId || null,
      commentId: dto.commentId || null,
      uploadedBy: userId,
      fileName: dto.fileName,
      fileSize: actualSize,
      mimeType: dto.mimeType,
      storageKey: dto.storageKey,
      storageBucket: dto.storageBucket,
    });

    return this.attachmentRepository.save(attachment);
  }

  private sanitizeFileName(name: string): string {
    return (name || 'file')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 200);
  }

  // ── Legacy in-process upload (kept for backward compatibility) ──

  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ): Promise<Attachment> {
    await this.ensureBucket();
    const key = `${uuidv4()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const attachment = this.attachmentRepository.create({
      issueId: dto.issueId || null,
      commentId: dto.commentId || null,
      uploadedBy: userId,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      storageKey: key,
      storageBucket: this.bucket,
    });

    return this.attachmentRepository.save(attachment);
  }

  async getPresignedUrl(id: string, organizationId?: string): Promise<string> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: ['issue', 'issue.project'],
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (organizationId && attachment.issue?.project?.organizationId !== organizationId) {
      throw new NotFoundException('Attachment not found');
    }

    const command = new GetObjectCommand({
      Bucket: attachment.storageBucket,
      Key: attachment.storageKey,
    });

    return getSignedUrl(this.signerClient, command, { expiresIn: 3600 });
  }

  async streamFile(id: string, organizationId?: string): Promise<{
    stream: Readable;
    mimeType: string;
    fileName: string;
    fileSize: number;
  }> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: ['issue', 'issue.project'],
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (organizationId && attachment.issue?.project?.organizationId !== organizationId) {
      throw new NotFoundException('Attachment not found');
    }

    const command = new GetObjectCommand({
      Bucket: attachment.storageBucket,
      Key: attachment.storageKey,
    });

    const response = await this.s3Client.send(command);

    return {
      stream: response.Body as Readable,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      fileSize: Number(attachment.fileSize),
    };
  }

  async findByIssue(issueId: string): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      where: { issueId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: string, userId: string, organizationId?: string): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
      relations: ['issue', 'issue.project'],
    });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }
    if (organizationId && attachment.issue?.project?.organizationId !== organizationId) {
      throw new NotFoundException('Attachment not found');
    }
    if (attachment.uploadedBy !== userId) {
      throw new ForbiddenException('You can only delete your own files');
    }

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: attachment.storageBucket,
        Key: attachment.storageKey,
      }),
    );

    await this.attachmentRepository.remove(attachment);
  }
}
