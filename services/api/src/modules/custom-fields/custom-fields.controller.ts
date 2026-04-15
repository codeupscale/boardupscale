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
import { CustomFieldsService } from './custom-fields.service';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { UpdateFieldDefinitionDto } from './dto/update-field-definition.dto';
import { SetFieldValueDto } from './dto/set-field-value.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('custom-fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CustomFieldsController {
  constructor(private customFieldsService: CustomFieldsService) {}

  @Post('projects/:projectId/custom-fields')
  @RequirePermission('custom-field', 'create')
  @ApiOperation({ summary: 'Create a custom field definition' })
  async createDefinition(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
    @Body() dto: CreateFieldDefinitionDto,
  ) {
    const definition = await this.customFieldsService.createDefinition(
      organizationId,
      projectId,
      dto,
    );
    return { data: definition };
  }

  @Get('projects/:projectId/custom-fields')
  @ApiOperation({ summary: 'List custom field definitions for a project' })
  async getDefinitions(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @OrgId() organizationId: string,
  ) {
    const definitions = await this.customFieldsService.getDefinitions(
      organizationId,
      projectId,
    );
    return { data: definitions };
  }

  @Put('custom-fields/:id')
  @RequirePermission('custom-field', 'update')
  @ApiOperation({ summary: 'Update a custom field definition' })
  async updateDefinition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFieldDefinitionDto,
  ) {
    const definition = await this.customFieldsService.updateDefinition(id, dto);
    return { data: definition };
  }

  @Delete('custom-fields/:id')
  @RequirePermission('custom-field', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom field definition' })
  async deleteDefinition(@Param('id', ParseUUIDPipe) id: string) {
    await this.customFieldsService.deleteDefinition(id);
  }

  @Put('issues/:issueId/custom-fields')
  @RequirePermission('issue', 'update')
  @ApiOperation({ summary: 'Set custom field values for an issue' })
  async setFieldValues(
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() values: SetFieldValueDto[],
  ) {
    const result = await this.customFieldsService.bulkSetFieldValues(
      issueId,
      values,
    );
    return { data: result };
  }

  @Get('issues/:issueId/custom-fields')
  @ApiOperation({ summary: 'Get custom field values for an issue' })
  async getFieldValues(
    @Param('issueId', ParseUUIDPipe) issueId: string,
  ) {
    const values = await this.customFieldsService.getFieldValues(issueId);
    return { data: values };
  }
}
