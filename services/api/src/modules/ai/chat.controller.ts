import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ChatService } from './chat.service';
import { CreateConversationDto, SendMessageDto } from './dto/chat.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async listConversations(
    @Query('projectId') projectId: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.chatService.listConversations(projectId, user.id, organizationId);
  }

  @Post('conversations')
  async createConversation(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.chatService.createConversation(dto.projectId, user.id, organizationId);
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.chatService.getConversation(id, user.id, organizationId);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    await this.chatService.deleteConversation(id, user.id, organizationId);
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const chunk of this.chatService.sendMessageStream(
        id,
        dto.content,
        user.id,
        organizationId,
      )) {
        res.write(`event: ${chunk.event}\ndata: ${JSON.stringify(chunk.data)}\n\n`);
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    }

    res.end();
  }
}
