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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private commentsService: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get comments for an issue' })
  @ApiQuery({ name: 'issueId', required: true })
  async findAll(@Query('issueId', ParseUUIDPipe) issueId: string) {
    const comments = await this.commentsService.findAll(issueId);
    return { data: comments };
  }

  @Post()
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a comment (soft delete)' })
  async delete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: any) {
    await this.commentsService.delete(id, user.id);
  }
}
