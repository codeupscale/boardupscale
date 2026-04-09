import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  /**
   * Transform a Notification entity into the API response shape.
   * Converts `readAt` timestamp → `read` boolean for frontend consumption.
   */
  private toResponse(notification: any) {
    const { readAt, ...rest } = notification;
    return { ...rest, read: !!readAt };
  }

  @Get()
  @ApiOperation({ summary: 'Get notifications (paginated, unread first)' })
  async findAll(@CurrentUser() user: any, @Query() pagination: PaginationDto) {
    const result = await this.notificationsService.findAll(user.id, pagination.page, pagination.limit);
    return {
      data: result.items.map((n) => this.toResponse(n)),
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
        unreadCount: result.unreadCount,
      },
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markRead(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    const notification = await this.notificationsService.markRead(id, user.id);
    return this.toResponse(notification);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllRead(@CurrentUser() user: any) {
    const { affected } = await this.notificationsService.markAllRead(user.id);
    return { message: 'All notifications marked as read', affected };
  }
}
