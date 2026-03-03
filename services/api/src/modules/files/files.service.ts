import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Attachment } from './entities/attachment.entity';
import { UploadFileDto } from './dto/upload-file.dto';

@Injectable()
export class FilesService {
  private s3Client: S3Client;
  private bucket: string;

  constructor(
    @InjectRepository(Attachment)
    private attachmentRepository: Repository<Attachment>,
    private configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>('minio.endpoint');
    const port = this.configService.get<number>('minio.port');
    const useSSL = this.configService.get<boolean>('minio.useSSL');

    this.s3Client = new S3Client({
      endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('minio.accessKey'),
        secretAccessKey: this.configService.get<string>('minio.secretKey'),
      },
      forcePathStyle: true,
    });

    this.bucket = this.configService.get<string>('minio.bucket');
  }

  async upload(
    file: Express.Multer.File,
    dto: UploadFileDto,
    userId: string,
  ): Promise<Attachment> {
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

  async getPresignedUrl(id: string): Promise<string> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    const command = new GetObjectCommand({
      Bucket: attachment.storageBucket,
      Key: attachment.storageKey,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  async findByIssue(issueId: string): Promise<Attachment[]> {
    return this.attachmentRepository.find({
      where: { issueId },
      relations: ['uploader'],
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: string, userId: string): Promise<void> {
    const attachment = await this.attachmentRepository.findOne({ where: { id } });
    if (!attachment) {
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
