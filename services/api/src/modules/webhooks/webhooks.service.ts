import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(Webhook)
    private webhookRepository: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private deliveryRepository: Repository<WebhookDelivery>,
  ) {}

  async create(
    dto: CreateWebhookDto,
    organizationId: string,
    userId: string,
  ): Promise<Webhook> {
    const webhook = this.webhookRepository.create({
      organizationId,
      projectId: dto.projectId || null,
      name: dto.name,
      url: dto.url,
      secret: dto.secret || null,
      events: dto.events,
      headers: dto.headers || {},
      createdBy: userId,
    });
    return this.webhookRepository.save(webhook);
  }

  async findAll(
    organizationId: string,
    projectId?: string,
  ): Promise<Webhook[]> {
    const where: any = { organizationId };
    if (projectId) {
      where.projectId = projectId;
    }
    return this.webhookRepository.find({
      where,
      order: { createdAt: 'DESC' },
      relations: ['creator'],
    });
  }

  async findById(id: string): Promise<Webhook> {
    const webhook = await this.webhookRepository.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!webhook) {
      throw new NotFoundException('Webhook not found');
    }
    return webhook;
  }

  async update(id: string, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findById(id);
    Object.assign(webhook, dto);
    return this.webhookRepository.save(webhook);
  }

  async delete(id: string): Promise<void> {
    const webhook = await this.findById(id);
    await this.webhookRepository.remove(webhook);
  }

  /**
   * Find all active webhooks that match the given event type.
   * Matches webhooks that are org-wide (projectId=null) or project-specific.
   */
  async findWebhooksForEvent(
    organizationId: string,
    projectId: string | null,
    eventType: string,
  ): Promise<Webhook[]> {
    const qb = this.webhookRepository
      .createQueryBuilder('webhook')
      .where('webhook.organization_id = :organizationId', { organizationId })
      .andWhere('webhook.is_active = true')
      .andWhere(':eventType = ANY(webhook.events)', { eventType });

    if (projectId) {
      // Match org-wide webhooks OR project-specific webhooks
      qb.andWhere(
        '(webhook.project_id IS NULL OR webhook.project_id = :projectId)',
        { projectId },
      );
    } else {
      // Only org-wide webhooks
      qb.andWhere('webhook.project_id IS NULL');
    }

    return qb.getMany();
  }

  async createDelivery(
    webhookId: string,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<WebhookDelivery> {
    const delivery = this.deliveryRepository.create({
      webhookId,
      eventType,
      payload,
      status: 'pending',
      attempt: 1,
    });
    return this.deliveryRepository.save(delivery);
  }

  async getDeliveries(
    webhookId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const [items, total] = await this.deliveryRepository.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async getDeliveryById(id: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ['webhook'],
    });
    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }
    return delivery;
  }

  async updateDelivery(
    id: string,
    data: Partial<WebhookDelivery>,
  ): Promise<WebhookDelivery> {
    await this.deliveryRepository.update(id, data);
    return this.getDeliveryById(id);
  }

  async retryDelivery(id: string): Promise<WebhookDelivery> {
    const delivery = await this.getDeliveryById(id);
    if (delivery.status !== 'failed') {
      throw new NotFoundException('Only failed deliveries can be retried');
    }
    // Reset status to pending so the worker picks it up again
    delivery.status = 'pending';
    delivery.attempt = delivery.attempt + 1;
    delivery.nextRetryAt = null;
    return this.deliveryRepository.save(delivery);
  }
}
