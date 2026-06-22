/**
 * MinIO/S3 helpers for portability attachment copy.
 */
import {
  S3Client,
  CopyObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

let s3Client: S3Client | null = null;
let defaultBucket = 'boardupscale';

export function getPortabilityS3Client(): S3Client {
  if (s3Client) return s3Client;
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = process.env.MINIO_PORT ?? '9000';
  const useSSL = process.env.MINIO_USE_SSL === 'true';
  defaultBucket = process.env.MINIO_BUCKET ?? 'boardupscale';
  s3Client = new S3Client({
    endpoint: `${useSSL ? 'https' : 'http'}://${endpoint}:${port}`,
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });
  return s3Client;
}

export function getPortabilityBucket(): string {
  getPortabilityS3Client();
  return defaultBucket;
}

export async function ensurePortabilityBucket(): Promise<void> {
  const client = getPortabilityS3Client();
  const bucket = getPortabilityBucket();
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

export async function copyAttachmentObject(
  sourceBucket: string,
  sourceKey: string,
  targetFileName: string,
): Promise<{ storageKey: string; storageBucket: string; fileSize: number }> {
  const client = getPortabilityS3Client();
  const bucket = getPortabilityBucket();
  await ensurePortabilityBucket();

  const head = await client.send(
    new HeadObjectCommand({ Bucket: sourceBucket, Key: sourceKey }),
  );
  const fileSize = Number(head.ContentLength ?? 0);

  const safeName = targetFileName.replace(/[^\w.\-()+ ]/g, '_').slice(0, 200);
  const storageKey = `${uuidv4()}-${safeName}`;

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: storageKey,
      CopySource: encodeURIComponent(`${sourceBucket}/${sourceKey}`),
      MetadataDirective: 'COPY',
    }),
  );

  return { storageKey, storageBucket: bucket, fileSize };
}
