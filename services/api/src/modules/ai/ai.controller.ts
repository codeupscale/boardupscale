import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { StrictThrottle } from '../../common/decorators/throttle.decorator';
import { SuggestFieldsDto } from './dto/suggest-fields.dto';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { AuditService } from '../audit/audit.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(
    private aiService: AiService,
    private auditService: AuditService,
  ) {}

  @Get('status')
  @RequirePermission('ai', 'read')
  @ApiOperation({ summary: 'Get AI feature status and usage for the current organization' })
  async getStatus(@OrgId() organizationId: string) {
    const status = await this.aiService.getStatus(organizationId);
    return { data: status };
  }

  @Get('admin/usage')
  @RequirePermission('ai', 'admin')
  @ApiOperation({ summary: 'AI usage analytics for org admins' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async getUsageStats(
    @OrgId() organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const stats = await this.aiService.getUsageStats(organizationId, from, to);
    return { data: stats };
  }

  @Post('suggest-fields')
  @RequirePermission('ai', 'use')
  @StrictThrottle()
  @ApiOperation({ summary: 'AI-powered issue field suggestions (type, priority, title, assignees)' })
  async suggestFields(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: SuggestFieldsDto,
  ) {
    this.assertAiReady();

    const suggestions = await this.aiService.suggestFields({
      title: dto.title,
      description: dto.description,
      projectId: dto.projectId,
      organizationId,
      userId: user.id,
    });

    await this.auditService.log(organizationId, user.id, 'AI_SUGGEST_FIELDS', 'ai', null, { feature: 'suggest-fields' });
    return { data: suggestions };
  }

  @Post('summarize/:issueId')
  @RequirePermission('ai', 'use')
  @StrictThrottle()
  @ApiOperation({ summary: 'AI-powered issue summarization (summary, key decisions, blockers, next steps)' })
  @ApiParam({ name: 'issueId', description: 'Issue ID to summarize' })
  async summarizeIssue(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Param('issueId') issueId: string,
  ) {
    this.assertAiReady();

    const summary = await this.aiService.summarizeIssue({
      issueId,
      organizationId,
      userId: user.id,
    });

    await this.auditService.log(organizationId, user.id, 'AI_SUMMARIZE_ISSUE', 'issue', issueId, { feature: 'summarize-issue' });
    return { data: summary };
  }

  @Get('sprint-insights/:sprintId')
  @RequirePermission('ai', 'read')
  @ApiOperation({ summary: 'AI-powered sprint intelligence (predictions, workload, suggestions)' })
  @ApiParam({ name: 'sprintId', description: 'Sprint ID to analyze' })
  async getSprintInsights(
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Param('sprintId') sprintId: string,
  ) {
    this.assertAiReady();

    const insights = await this.aiService.getSprintInsights({
      sprintId,
      organizationId,
      userId: user.id,
    });

    return { data: insights };
  }

  @Get('suggest-assignee')
  @RequirePermission('ai', 'read')
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

  private assertAiReady(): void {
    if (!this.aiService.isEnabled()) {
      throw new HttpException({ enabled: false, message: 'AI features are disabled' }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!this.aiService.isAvailable()) {
      throw new HttpException('AI features are not available. Check your API key configuration.', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
