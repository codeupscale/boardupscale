import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImportService } from './import.service';
import { JiraConnectionService } from './jira-connection.service';
import { JiraImportJobService } from './jira-import-job.service';
import { StartImportDto, PreviewImportDto } from './dto/import-jira.dto';
import {
  SaveJiraConnectionDto,
  TestJiraConnectionDto,
  StartApiImportDto,
} from './dto/jira-connection.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('import')
export class ImportController {
  constructor(
    private importService: ImportService,
    private jiraConnectionService: JiraConnectionService,
    private jiraImportJobService: JiraImportJobService,
  ) {}

  // ── File-upload import (existing) ─────────────────────────────────────────

  @Post('jira/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.originalname) {
          cb(new BadRequestException('Invalid file'), false);
        } else if (!file.originalname.toLowerCase().endsWith('.json')) {
          cb(new BadRequestException('Only JSON files are supported'), false);
        } else {
          cb(null, true);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload a Jira export JSON file' })
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    const filePath = await this.importService.uploadFile(file);
    return { data: { filePath } };
  }

  @Post('jira/preview')
  @ApiOperation({ summary: 'Preview a Jira file import' })
  @ApiResponse({ status: 200, description: 'Import preview summary' })
  async previewImport(
    @Body() dto: PreviewImportDto,
    @OrgId() organizationId: string,
  ) {
    const preview = await this.importService.previewImport(
      dto.filePath,
      organizationId,
    );
    return { data: preview };
  }

  @Post('jira/start')
  @ApiOperation({ summary: 'Start a file-based Jira import job' })
  @ApiResponse({ status: 201, description: 'Import job started' })
  async startImport(
    @Body() dto: StartImportDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    const jobId = await this.importService.startImport(
      dto,
      organizationId,
      user.id,
    );
    return { data: { jobId } };
  }

  @Get('jira/status/:jobId')
  @ApiOperation({ summary: 'Get the status of any Jira import job (file or API)' })
  @ApiResponse({ status: 200, description: 'Import job status' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getImportStatus(
    @Param('jobId') jobId: string,
    @OrgId() organizationId: string,
  ) {
    // Try the new unified job service first (covers both api and file imports
    // that have a DB record), then fall back to the legacy Redis-only path.
    try {
      const status = await this.jiraImportJobService.getStatus(
        jobId,
        organizationId,
      );
      return { data: status };
    } catch {
      // Legacy file-upload jobs only have Redis status
      const status = await this.importService.getImportStatus(jobId);
      return { data: status };
    }
  }

  @Get('jira/jobs')
  @ApiOperation({ summary: 'List recent import jobs for this organisation' })
  @ApiResponse({ status: 200, description: 'List of import jobs' })
  async listJobs(@OrgId() organizationId: string) {
    const jobs = await this.jiraImportJobService.listJobs(organizationId);
    return { data: jobs };
  }

  // ── Jira connection management ────────────────────────────────────────────

  @Get('jira/connection')
  @ApiOperation({ summary: 'Get the active Jira connection for this organisation' })
  @ApiResponse({ status: 200, description: 'Jira connection (no token in response)' })
  async getConnection(@OrgId() organizationId: string) {
    const connection =
      await this.jiraConnectionService.getConnection(organizationId);
    return { data: connection };
  }

  @Post('jira/connection')
  @ApiOperation({ summary: 'Save Jira connection credentials' })
  @ApiResponse({ status: 201, description: 'Connection saved' })
  async saveConnection(
    @Body() dto: SaveJiraConnectionDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    const connection = await this.jiraConnectionService.saveConnection(
      dto,
      organizationId,
      user.id,
    );
    return { data: connection };
  }

  @Post('jira/connection/test')
  @ApiOperation({ summary: 'Test Jira credentials (not yet saved)' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testConnection(@Body() dto: TestJiraConnectionDto) {
    const result = await this.jiraConnectionService.testConnectionDirect(dto);
    return { data: result };
  }

  @Post('jira/connection/:connectionId/test')
  @ApiOperation({ summary: 'Test an existing saved Jira connection' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testSavedConnection(
    @Param('connectionId') connectionId: string,
    @OrgId() organizationId: string,
  ) {
    const result = await this.jiraConnectionService.testSavedConnection(
      connectionId,
      organizationId,
    );
    return { data: result };
  }

  @Get('jira/connection/:connectionId/projects')
  @ApiOperation({ summary: 'List Jira projects available via the saved connection' })
  @ApiResponse({ status: 200, description: 'List of Jira projects' })
  async listJiraProjects(
    @Param('connectionId') connectionId: string,
    @OrgId() organizationId: string,
  ) {
    const projects = await this.jiraConnectionService.listProjects(
      connectionId,
      organizationId,
    );
    return { data: projects };
  }

  @Delete('jira/connection/:connectionId')
  @ApiOperation({ summary: 'Delete a Jira connection' })
  @ApiResponse({ status: 200, description: 'Connection deleted' })
  async deleteConnection(
    @Param('connectionId') connectionId: string,
    @OrgId() organizationId: string,
  ) {
    await this.jiraConnectionService.deleteConnection(
      connectionId,
      organizationId,
    );
    return { data: { deleted: true } };
  }

  // ── Live API import ───────────────────────────────────────────────────────

  @Post('jira/connect/start')
  @ApiOperation({ summary: 'Start a live Jira API import job' })
  @ApiResponse({ status: 201, description: 'Import job enqueued' })
  @ApiResponse({ status: 400, description: 'Invalid connection or project keys' })
  async startApiImport(
    @Body() dto: StartApiImportDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    // Verify the connection belongs to this org before enqueuing
    await this.jiraConnectionService.getDecryptedCredentials(
      dto.connectionId,
      organizationId,
    );

    const jobId = await this.jiraImportJobService.startApiImport(
      dto,
      organizationId,
      user.id,
    );
    return { data: { jobId } };
  }
}
