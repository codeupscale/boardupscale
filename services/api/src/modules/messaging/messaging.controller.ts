import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateDirectMessageDto } from './dto/create-direct-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private messagingService: MessagingService) {}

  @Get('channels')
  @ApiOperation({ summary: 'List user channels with last message and unread count' })
  async getChannels(
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const channels = await this.messagingService.getChannels(userId, organizationId);
    return { data: channels };
  }

  @Post('channels')
  @ApiOperation({ summary: 'Create a group channel' })
  async createChannel(
    @Body() dto: CreateChannelDto,
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const channel = await this.messagingService.createGroupChannel(dto, userId, organizationId);
    return { data: channel };
  }

  @Post('channels/direct')
  @ApiOperation({ summary: 'Get or create a direct message channel' })
  async getOrCreateDirect(
    @Body() dto: CreateDirectMessageDto,
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const channel = await this.messagingService.getOrCreateDirectChannel(
      dto.userId,
      userId,
      organizationId,
    );
    return { data: channel };
  }

  @Get('channels/:id/messages')
  @ApiOperation({ summary: 'Get paginated messages for a channel' })
  async getMessages(
    @Param('id', ParseUUIDPipe) channelId: string,
    @Query() query: GetMessagesDto,
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const result = await this.messagingService.getMessages(
      channelId,
      userId,
      organizationId,
      query.before,
      query.limit,
    );
    return { data: result };
  }

  @Post('channels/:id/messages')
  @ApiOperation({ summary: 'Send a message to a channel' })
  async sendMessage(
    @Param('id', ParseUUIDPipe) channelId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const message = await this.messagingService.sendMessage(
      channelId,
      dto,
      userId,
      organizationId,
    );
    return { data: message };
  }

  @Put('channels/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark channel as read' })
  async markAsRead(
    @Param('id', ParseUUIDPipe) channelId: string,
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    await this.messagingService.markAsRead(channelId, userId, organizationId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count across all channels' })
  async getUnreadCount(
    @CurrentUser('id') userId: string,
    @OrgId() organizationId: string,
  ) {
    const count = await this.messagingService.getUnreadCount(userId, organizationId);
    return { data: { count } };
  }
}
