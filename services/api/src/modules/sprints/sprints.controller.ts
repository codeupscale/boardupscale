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
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SprintsService } from './sprints.service';
import { CreateSprintDto } from './dto/create-sprint.dto';
import { UpdateSprintDto } from './dto/update-sprint.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';
import { ResolveProjectBodyInterceptor } from '../../common/interceptors/resolve-project-body.interceptor';

@ApiTags('sprints')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(ResolveProjectBodyInterceptor)
@Controller('sprints')
export class SprintsController {
  constructor(private sprintsService: SprintsService) {}

  @Get()
  @ApiOperation({ summary: 'List sprints for a project' })
  @ApiQuery({ name: 'projectId', required: true })
  async findAll(
    @Query('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const sprints = await this.sprintsService.findAll(projectId, organizationId);
    return { data: sprints };
  }

  @Post()
  @RequirePermission('sprint', 'create')
  @ApiOperation({ summary: 'Create a new sprint' })
  async create(@Body() dto: CreateSprintDto, @OrgId() organizationId: string) {
    return this.sprintsService.create(dto, organizationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sprint by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sprintsService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('sprint', 'update')
  @ApiOperation({ summary: 'Update a sprint' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
    @Body() dto: UpdateSprintDto,
  ) {
    return this.sprintsService.update(id, organizationId, dto);
  }

  @Post(':id/start')
  @RequirePermission('sprint', 'manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a sprint' })
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.sprintsService.start(id, organizationId);
  }

  @Post(':id/complete')
  @RequirePermission('sprint', 'manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a sprint (moves incomplete issues to backlog)' })
  async complete(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    return this.sprintsService.complete(id, organizationId);
  }

  @Delete(':id')
  @RequirePermission('sprint', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a sprint' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.sprintsService.delete(id, organizationId);
  }
}
