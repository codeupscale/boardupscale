import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ComponentsService } from './components.service';
import { CreateComponentDto } from './dto/create-component.dto';
import { UpdateComponentDto } from './dto/update-component.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('components')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ComponentsController {
  constructor(private componentsService: ComponentsService) {}

  @Post('projects/:projectId/components')
  @RequirePermission('component', 'create')
  @ApiOperation({ summary: 'Create a component for a project' })
  async create(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Body() dto: CreateComponentDto,
  ) {
    const component = await this.componentsService.create(projectId, dto);
    return { data: component };
  }

  @Get('projects/:projectId/components')
  @ApiOperation({ summary: 'List all components for a project' })
  async findAll(@Param('projectId', ResolveProjectPipe) projectId: string) {
    const components = await this.componentsService.findAll(projectId);
    return { data: components };
  }

  @Get('components/:id')
  @ApiOperation({ summary: 'Get a component by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const component = await this.componentsService.findById(id);
    return { data: component };
  }

  @Put('components/:id')
  @RequirePermission('component', 'update')
  @ApiOperation({ summary: 'Update a component' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateComponentDto,
  ) {
    const component = await this.componentsService.update(id, dto);
    return { data: component };
  }

  @Delete('components/:id')
  @RequirePermission('component', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a component' })
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    await this.componentsService.delete(id);
  }

  @Get('issues/:issueId/components')
  @ApiOperation({ summary: 'Get components assigned to an issue' })
  async getIssueComponents(
    @Param('issueId', ParseUUIDPipe) issueId: string,
  ) {
    const components = await this.componentsService.getIssueComponents(issueId);
    return { data: components };
  }

  @Put('issues/:issueId/components')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Set components for an issue' })
  async setIssueComponents(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() body: { componentIds: string[] },
  ) {
    const components = await this.componentsService.setIssueComponents(
      issueId,
      body.componentIds,
    );
    return { data: components };
  }
}
