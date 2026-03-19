import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get comments for an issue' })
  @ApiQuery({ name: 'issueId', required: true })
  async findAll(@Query('issueId', ParseUUIDPipe) issueId: string, @OrgId() organizationId: string) {
    const comments = await this.commentsService.findAll(issueId, organizationId);
    return { data: comments };
  }

  @Post()
  @RequirePermission('comment', 'create')
  @ApiOperation({ summary: 'Create a comment on an issue' })
  async create(
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: any,
    @OrgId() organizationId: string,
  ) {
    return this.commentsService.create(dto, user.id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a comment' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(id, user.id, dto);
  }

  @Delete(':id')
  @RequirePermission('comment', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (soft delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    await this.commentsService.delete(id, user.id);
  }
}
