import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  DefaultValuePipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Header,
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
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { ProjectPortabilityService } from './project-portability.service';
import {
  PreviewPortabilityImportDto,
  StartPortabilityImportDto,
} from './dto/portability.dto';

@ApiTags('project-portability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProjectPortabilityController {
  constructor(private readonly portabilityService: ProjectPortabilityService) {}

  @Get('projects/:projectId/portability/export')
  @RequirePermission('project', 'read')
  @ApiOperation({ summary: 'Export full project bundle as JSON' })
  @ApiResponse({ status: 200, description: 'Project bundle JSON download' })
  async exportProject(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Res() res: Response,
  ): Promise<void> {
    const bundle = await this.portabilityService.exportBundle(projectId, organizationId);
    const filename = `${bundle.manifest.sourceProjectKey}-export-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Post('portability/upload')
  @RequirePermission('project', 'create')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file?.originalname?.toLowerCase().endsWith('.json')) {
          cb(new BadRequestException('Only JSON bundle files are supported'), false);
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
  @ApiOperation({ summary: 'Upload a project bundle JSON for import' })
  async uploadBundle(
    @UploadedFile() file: Express.Multer.File,
    @OrgId() organizationId: string,
  ) {
    const data = await this.portabilityService.uploadBundle(file, organizationId);
    return { status: true, message: 'Bundle uploaded', data };
  }

  @Post('portability/preview')
  @RequirePermission('project', 'create')
  @ApiOperation({ summary: 'Preview import with status mapping and data-loss warnings' })
  async previewImport(
    @Body() dto: PreviewPortabilityImportDto,
    @OrgId() organizationId: string,
  ) {
    const { preview, checksum } = await this.portabilityService.previewImport(
      dto,
      organizationId,
    );
    return { status: true, message: 'Preview ready', data: { preview, checksum } };
  }

  @Post('portability/start')
  @RequirePermission('project', 'create')
  @ApiOperation({ summary: 'Start async project import job' })
  async startImport(
    @Body() dto: StartPortabilityImportDto,
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.portabilityService.startImport(dto, organizationId, userId);
    return { status: true, message: 'Import started', data };
  }

  @Get('portability/status/:jobId')
  @RequirePermission('project', 'read')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOperation({ summary: 'Poll import job progress' })
  async getStatus(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.portabilityService.getStatus(jobId, organizationId);
    return { status: true, message: 'OK', data };
  }

  @Post('portability/cancel/:jobId')
  @RequirePermission('project', 'create')
  @ApiOperation({ summary: 'Cancel an active import job' })
  async cancel(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @OrgId() organizationId: string,
  ) {
    const data = await this.portabilityService.cancel(jobId, organizationId);
    return { status: true, message: 'Import cancelled', data };
  }

  @Post('portability/retry/:jobId')
  @RequirePermission('project', 'create')
  @ApiOperation({ summary: 'Retry a failed, cancelled, or stalled import job' })
  async retry(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.portabilityService.retry(jobId, organizationId, userId);
    return { status: true, message: 'Import re-queued', data };
  }

  @Post('portability/undo/:jobId')
  @RequirePermission('project', 'delete')
  @ApiOperation({ summary: 'Undo a completed import (soft-delete imported project data)' })
  async undo(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.portabilityService.undo(jobId, organizationId, userId);
    return { status: true, message: 'Undo started', data };
  }

  @Get('portability/history')
  @RequirePermission('project', 'read')
  @ApiOperation({ summary: 'List portability import history' })
  async history(
    @OrgId() organizationId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const data = await this.portabilityService.getHistory(organizationId, page, limit);
    return { status: true, message: 'OK', data };
  }
}
