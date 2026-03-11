import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VersionsService } from './versions.service';
import { CreateVersionDto } from './dto/create-version.dto';
import { UpdateVersionDto } from './dto/update-version.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('versions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class VersionsController {
  constructor(private versionsService: VersionsService) {}

  @Post('projects/:projectId/versions')
  @ApiOperation({ summary: 'Create a version for a project' })
  async create(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Body() dto: CreateVersionDto,
  ) {
    const version = await this.versionsService.create(projectId, dto);
    return { data: version };
  }

  @Get('projects/:projectId/versions')
  @ApiOperation({ summary: 'List all versions for a project' })
  async findAll(@Param('projectId', ResolveProjectPipe) projectId: string) {
    const versions = await this.versionsService.findAll(projectId);
    return { data: versions };
  }

  @Get('versions/:id')
  @ApiOperation({ summary: 'Get a version by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const version = await this.versionsService.findById(id);
    return { data: version };
  }

  @Put('versions/:id')
  @ApiOperation({ summary: 'Update a version' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVersionDto,
  ) {
    const version = await this.versionsService.update(id, dto);
    return { data: version };
  }

  @Delete('versions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a version' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.versionsService.delete(id);
  }

  @Post('versions/:id/release')
  @ApiOperation({ summary: 'Release a version' })
  async release(@Param('id', ParseUUIDPipe) id: string) {
    const version = await this.versionsService.release(id);
    return { data: version };
  }

  @Get('versions/:id/progress')
  @ApiOperation({ summary: 'Get version issue progress' })
  async getProgress(@Param('id', ParseUUIDPipe) id: string) {
    const progress = await this.versionsService.getVersionIssueCount(id);
    return { data: progress };
  }

  @Get('issues/:issueId/versions')
  @ApiOperation({ summary: 'Get versions assigned to an issue' })
  async getIssueVersions(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Query('relationType') relationType?: string,
  ) {
    const versions = await this.versionsService.getIssueVersions(
      issueId,
      relationType,
    );
    return { data: versions };
  }

  @Put('issues/:issueId/versions')
  @ApiOperation({ summary: 'Set versions for an issue' })
  async setIssueVersions(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() body: { versionIds: string[]; relationType?: string },
  ) {
    const versions = await this.versionsService.setIssueVersions(
      issueId,
      body.versionIds,
      body.relationType || 'fix',
    );
    return { data: versions };
  }
}
