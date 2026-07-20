import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  private toResponse(notification: any) {
    const { readAt, ...rest } = notification;
    return { ...rest, read: !!readAt };
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get notifications for the active organization' })
  async findAll(
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
    @Query() query: ListNotificationsDto,
  ) {
    const result = await this.notificationsService.findAll(
      user.id,
      organizationId,
      query.page ?? 1,
      query.limit ?? 20,
      query.filter ?? 'all',
    );
    return {
      data: result.items.map((n) => this.toResponse(n)),
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit) || 0,
        unreadCount: result.unreadCount,
      },
    };
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get unread notification count for active organization' })
  async getUnreadCount(@CurrentUser() user: any, @OrgId() organizationId: string) {
    const count = await this.notificationsService.getUnreadCount(user.id, organizationId);
    return { count, organizationId };
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getPreferences(@CurrentUser() user: any) {
    return this.notificationsService.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  async updatePreferences(
    @CurrentUser() user: any,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.notificationsService.updatePreferences(user.id, dto);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    const notification = await this.notificationsService.markRead(
      id,
      user.id,
      organizationId,
    );
    return this.toResponse(notification);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read in active organization' })
  async markAllRead(@CurrentUser() user: any, @OrgId() organizationId: string) {
    const { affected } = await this.notificationsService.markAllRead(
      user.id,
      organizationId,
    );
    return { message: 'All notifications marked as read', affected };
  }
}
