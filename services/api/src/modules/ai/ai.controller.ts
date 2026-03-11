import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SuggestFieldsDto } from './dto/suggest-fields.dto';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get AI feature status and usage for the current organization' })
  async getStatus(@OrgId() organizationId: string) {
    const status = await this.aiService.getStatus(organizationId);
    return { data: status };
  }

  @Post('suggest-fields')
  @ApiOperation({ summary: 'AI-powered issue field suggestions (type, priority, title, assignees)' })
  async suggestFields(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: SuggestFieldsDto,
  ) {
    if (!this.aiService.isEnabled()) {
      return { data: { enabled: false } };
    }
    if (!this.aiService.isAvailable()) {
      throw new ForbiddenException('AI features are not available. Check your API key configuration.');
    }

    const suggestions = await this.aiService.suggestFields({
      title: dto.title,
      description: dto.description,
      projectId: dto.projectId,
      organizationId,
      userId: user.id,
    });

    return { data: suggestions };
  }

  @Post('summarize/:issueId')
  @ApiOperation({ summary: 'AI-powered issue summarization (summary, key decisions, blockers, next steps)' })
  @ApiParam({ name: 'issueId', description: 'Issue ID to summarize' })
  async summarizeIssue(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Param('issueId') issueId: string,
  ) {
    if (!this.aiService.isEnabled()) {
      return { data: { enabled: false } };
    }
    if (!this.aiService.isAvailable()) {
      throw new ForbiddenException('AI features are not available.');
    }

    const summary = await this.aiService.summarizeIssue({
      issueId,
      organizationId,
      userId: user.id,
    });

    return { data: summary };
  }

  @Get('sprint-insights/:sprintId')
  @ApiOperation({ summary: 'AI-powered sprint intelligence (predictions, workload, suggestions)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID to analyze' })
  async getSprintInsights(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Param('sprintId') sprintId: string,
  ) {
    if (!this.aiService.isEnabled()) {
      return { data: { enabled: false } };
    }

    const insights = await this.aiService.getSprintInsights({
      sprintId,
      organizationId,
      userId: user.id,
    });

    return { data: insights };
  }

  @Get('suggest-assignee')
  @ApiOperation({ summary: 'AI-powered assignee suggestions based on historical patterns and workload' })
  @ApiQuery({ name: 'projectId', required: true })
  @ApiQuery({ name: 'type', required: false, description: 'Issue type for context' })
  async suggestAssignee(
    @OrgId() organizationId: string,
    @Query('projectId', ResolveProjectPipe) projectId: string,
    @Query('type') type?: string,
  ) {
    const suggestions = await this.aiService.suggestAssignees({
      projectId,
      organizationId,
      type,
    });

    return { data: suggestions };
  }
}
