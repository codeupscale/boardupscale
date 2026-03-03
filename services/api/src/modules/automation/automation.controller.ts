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
import { AutomationService } from './automation.service';
import { AutomationEngineService } from './automation-engine.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AutomationController {
  constructor(
    private automationService: AutomationService,
    private automationEngine: AutomationEngineService,
  ) {}

  @Post('projects/:projectId/automations')
  @ApiOperation({ summary: 'Create an automation rule' })
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @OrgId() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateRuleDto,
  ) {
    return this.automationService.create(dto, projectId, organizationId, user.id);
  }

  @Get('projects/:projectId/automations')
  @ApiOperation({ summary: 'List automation rules for a project' })
  async findAll(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    const rules = await this.automationService.findAll(projectId);
    return { data: rules };
  }

  @Get('automations/:id')
  @ApiOperation({ summary: 'Get automation rule by ID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automationService.findById(id);
  }

  @Put('automations/:id')
  @ApiOperation({ summary: 'Update an automation rule' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRuleDto,
  ) {
    return this.automationService.update(id, dto);
  }

  @Delete('automations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an automation rule' })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.automationService.delete(id);
  }

  @Post('automations/:id/toggle')
  @ApiOperation({ summary: 'Toggle automation rule active/inactive' })
  async toggle(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.automationService.toggle(id);
  }

  @Get('automations/:id/logs')
  @ApiOperation({ summary: 'Get execution logs for an automation rule' })
  async getLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() pagination: PaginationDto,
  ) {
    const result = await this.automationService.getExecutionLogs(
      id,
      pagination.page,
      pagination.limit,
    );
    return {
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  @Post('automations/:id/test')
  @ApiOperation({ summary: 'Dry-run an automation rule against a specific issue' })
  async testRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('issueId') issueId: string,
    @OrgId() organizationId: string,
  ) {
    const result = await this.automationEngine.testRule(id, issueId, organizationId);
    return { data: result };
  }
}
