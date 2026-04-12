import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ContactSupportDto } from './dto/contact-support.dto';

export interface SupportContactPayload {
  userId: string;
  userEmail: string;
  userName: string;
  organizationId: string;
  subject: string;
  message: string;
  category?: string;
}

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    @InjectQueue('email')
    private emailQueue: Queue,
  ) {}

  async contactSupport(
    dto: ContactSupportDto,
    userId: string,
    userEmail: string,
    userName: string,
    organizationId: string,
  ): Promise<void> {
    const payload: SupportContactPayload = {
      userId,
      userEmail,
      userName,
      organizationId,
      subject: dto.subject,
      message: dto.message,
      category: dto.category,
    };

    await this.emailQueue.add('support-contact', payload);

    this.logger.log(
      `Support request enqueued from ${userEmail} (org: ${organizationId}): "${dto.subject}"`,
    );
  }
}
