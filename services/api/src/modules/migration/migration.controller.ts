import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

import { MigrationService } from './migration.service';
import { ConnectJiraDto } from './dto/connect-jira.dto';
import { PreviewMigrationDto, StartMigrationDto } from './dto/start-migration.dto';

@ApiTags('migration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('migration/jira')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  /**
   * POST /api/migration/jira/connect
   * Validate Jira credentials, store encrypted connection, return project list.
   */
  @Post('connect')
  @ApiOperation({ summary: 'Test Jira credentials and list available projects' })
  @ApiResponse({ status: 201, description: 'Connection successful — returns runId and project list' })
  @ApiResponse({ status: 400, description: 'Invalid Jira credentials' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async connect(
    @Body() dto: ConnectJiraDto,
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.migrationService.connect(dto, organizationId, userId);
    return { status: true, message: 'Connection successful', data: result };
  }

  /**
   * POST /api/migration/jira/preview
   * Return per-project issue/sprint counts for the selected projects.
   */
  @Post('preview')
  @ApiOperation({ summary: 'Preview issue and sprint counts for selected Jira projects' })
  @ApiResponse({ status: 201, description: 'Preview data returned' })
  @ApiResponse({ status: 404, description: 'Migration run not found' })
  async preview(
    @Body() dto: PreviewMigrationDto,
    @OrgId() organizationId: string,
  ) {
    const result = await this.migrationService.preview(dto, organizationId);
    return { status: true, message: 'Preview ready', data: result };
  }

  /**
   * POST /api/migration/jira/start
   * Persist configuration and enqueue the BullMQ migration job.
   */
  @Post('start')
  @ApiOperation({ summary: 'Start the Jira → Boardupscale migration' })
  @ApiResponse({ status: 201, description: 'Migration enqueued — returns runId' })
  @ApiResponse({ status: 400, description: 'Bad request or migration already in progress' })
  async start(
    @Body() dto: StartMigrationDto,
    @OrgId() organizationId: string,
  ) {
    const result = await this.migrationService.start(dto, organizationId);
    return { status: true, message: 'Migration started', data: result };
  }

  /**
   * GET /api/migration/jira/status/:runId
   * Poll current migration progress counters.
   */
  @Get('status/:runId')
  @ApiOperation({ summary: 'Poll migration progress' })
  @ApiParam({ name: 'runId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Current migration status' })
  @ApiResponse({ status: 404, description: 'Migration run not found' })
  async getStatus(
    @Param('runId', ParseUUIDPipe) runId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.migrationService.getStatus(runId, organizationId);
    return { status: true, message: 'OK', data };
  }

  /**
   * POST /api/migration/jira/retry/:runId
   * Re-enqueue a failed or cancelled migration run (resumes from last completed phase).
   */
  @Post('retry/:runId')
  @ApiOperation({ summary: 'Retry a failed migration run' })
  @ApiParam({ name: 'runId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Migration re-queued' })
  @ApiResponse({ status: 400, description: 'Run is not in a retryable state' })
  async retry(
    @Param('runId', ParseUUIDPipe) runId: string,
    @OrgId() organizationId: string,
  ) {
    const result = await this.migrationService.retry(runId, organizationId);
    return { status: true, message: 'Migration retried', data: result };
  }

  /**
   * GET /api/migration/jira/report/:runId
   * Return the full migration run record including result_summary and error_log.
   */
  @Get('report/:runId')
  @ApiOperation({ summary: 'Download full migration report' })
  @ApiParam({ name: 'runId', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Full migration report' })
  @ApiResponse({ status: 404, description: 'Migration run not found' })
  async getReport(
    @Param('runId', ParseUUIDPipe) runId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.migrationService.getReport(runId, organizationId);
    return { status: true, message: 'OK', data };
  }

  /**
   * GET /api/migration/jira/history
   * Paginated list of all migration runs for this organisation.
   */
  @Get('history')
  @ApiOperation({ summary: 'List migration run history for this organisation' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated migration history' })
  async getHistory(
    @OrgId() organizationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const result = await this.migrationService.getHistory(organizationId, page, limit);
    return { status: true, message: 'OK', data: result };
  }
}
