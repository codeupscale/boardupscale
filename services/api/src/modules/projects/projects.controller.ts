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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "List all projects the user is a member of" })
  async findAll(@OrgId() organizationId: string, @CurrentUser() user: any) {
    const projects = await this.projectsService.findAll(organizationId, user.id);
    return { data: projects };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  async create(
    @Body() dto: CreateProjectDto,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
  ) {
    return this.projectsService.create(dto, organizationId, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.projectsService.findById(id, organizationId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a project' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, organizationId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a project (soft delete)' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.projectsService.archive(id, organizationId);
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get project members' })
  async getMembers(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    const members = await this.projectsService.getMembers(id, organizationId);
    return { data: members };
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the project' })
  async addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projectsService.addMember(id, organizationId, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a member from the project' })
  async removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @OrgId() organizationId: string,
  ) {
    await this.projectsService.removeMember(id, organizationId, userId);
  }
}
