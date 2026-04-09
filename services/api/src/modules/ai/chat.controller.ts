import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StrictThrottle } from '../../common/decorators/throttle.decorator';
import { ChatService } from './chat.service';
import { CreateConversationDto, SendMessageDto } from './dto/chat.dto';
import { AuditService } from '../audit/audit.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai/chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly auditService: AuditService,
  ) {}

  @Get('conversations')
  @RequirePermission('ai', 'chat')
  async listConversations(
    @Query('projectId') projectId: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.chatService.listConversations(projectId, user.id, organizationId);
  }

  @Post('conversations')
  @RequirePermission('ai', 'chat')
  async createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    const conversation = await this.chatService.createConversation(dto.projectId, user.id, organizationId);
    await this.auditService.log(organizationId, user.id, 'AI_CREATE_CONVERSATION', 'chat_conversation', conversation.id);
    return conversation;
  }

  @Get('conversations/:id')
  @RequirePermission('ai', 'chat')
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getConversation(id, user.id, organizationId, before, limit ? parseInt(limit, 10) : undefined);
  }

  @Delete('conversations/:id')
  @RequirePermission('ai', 'chat')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    await this.chatService.deleteConversation(id, user.id, organizationId);
    await this.auditService.log(organizationId, user.id, 'AI_DELETE_CONVERSATION', 'chat_conversation', id);
  }

  @Get('search')
  @RequirePermission('ai', 'chat')
  @ApiQuery({ name: 'q', required: true })
  @ApiQuery({ name: 'projectId', required: false })
  async searchConversations(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Query('q') query: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.chatService.searchConversations(organizationId, user.id, query, projectId);
  }

  @Post('conversations/:id/messages')
  @RequirePermission('ai', 'chat')
  @StrictThrottle()
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Abort stream on client disconnect to stop wasting tokens
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    try {
      for await (const chunk of this.chatService.sendMessageStream(
        id,
        dto.content,
        user.id,
        organizationId,
        abortController.signal,
      )) {
        if (abortController.signal.aborted) break;
        res.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      }
    }

    res.end();
  }

  @Post('messages/:messageId/feedback')
  @RequirePermission('ai', 'chat')
  async submitFeedback(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: { rating: number; comment?: string },
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.chatService.submitFeedback(messageId, user.id, organizationId, dto.rating, dto.comment);
  }
}
