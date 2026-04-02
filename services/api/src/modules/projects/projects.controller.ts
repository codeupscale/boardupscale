import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List available project templates' })
  @ApiResponse({ status: 200, description: 'List of project templates' })
  getTemplates() {
    return { data: this.projectsService.getTemplates() };
  }

  @Get()
  @ApiOperation({
    summary: 'List projects in the organization (owner/admin: all; others: membership only)',
  })
  @ApiResponse({ status: 200, description: 'List of projects' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@OrgId() organizationId: string, @CurrentUser() user: any) {
    const projects = await this.projectsService.findAll(organizationId, user.id, user.role);
    return { data: projects };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project (optionally from a template)' })
  @ApiResponse({ status: 201, description: 'Project created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Project key already taken' })
  async create(
    @Body() dto: CreateProjectDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.create(dto, organizationId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  @ApiResponse({ status: 200, description: 'Project found' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async findOne(
    @Param('id', ResolveProjectPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.projectsService.findById(id, organizationId);
  }

  @Patch(':id')
  @RequirePermission('project', 'update')
  @ApiOperation({ summary: 'Update a project' })
  @ApiResponse({ status: 200, description: 'Project updated' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async update(
    @Param('id', ResolveProjectPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, organizationId, dto);
  }

  @Delete(':id')
  @RequirePermission('project', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a project (soft delete)' })
  @ApiResponse({ status: 204, description: 'Project archived' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  async archive(
    @Param('id', ResolveProjectPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.projectsService.archive(id, organizationId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get project members' })
  @ApiResponse({ status: 200, description: 'List of members' })
  async getMembers(
    @Param('id', ResolveProjectPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const members = await this.projectsService.getMembers(id, organizationId);
    return { data: members };
  }

  @Post(':id/members')
  @RequirePermission('member', 'create')
  @ApiOperation({ summary: 'Add a member to the project' })
  @ApiResponse({ status: 201, description: 'Member added' })
  @ApiResponse({ status: 409, description: 'User is already a member' })
  async addMember(
    @Param('id', ResolveProjectPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projectsService.addMember(id, organizationId, dto);
  }

  @Delete(':id/members/:userId')
  @RequirePermission('member', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the project' })
  @ApiResponse({ status: 204, description: 'Member removed' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  async removeMember(
    @Param('id', ResolveProjectPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @OrgId() organizationId: string,
  ) {
    await this.projectsService.removeMember(id, organizationId, userId);
  }
}
