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
import { PermissionsService } from './permissions.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';
import { ResolveProjectPipe } from '../../common/pipes/resolve-project.pipe';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PermissionsController {
  constructor(private permissionsService: PermissionsService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'List all available permissions' })
  async findAllPermissions() {
    const permissions = await this.permissionsService.findAllPermissions();
    return { data: permissions };
  }

  @Get('organizations/:orgId/roles')
  @ApiOperation({ summary: 'List roles for an organization (including system roles)' })
  async getRolesForOrg(@Param('orgId', ParseUUIDPipe) orgId: string) {
    const roles = await this.permissionsService.getRolesForOrg(orgId);
    return { data: roles };
  }

  @Post('organizations/:orgId/roles')
  @ApiOperation({ summary: 'Create a custom role for an organization' })
  async createRole(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateRoleDto,
  ) {
    const role = await this.permissionsService.createRole(
      orgId,
      dto.name,
      dto.description,
      dto.permissionIds,
    );
    return { data: role };
  }

  @Get('roles/:id')
  @ApiOperation({ summary: 'Get a single role by ID' })
  async getRoleById(@Param('id', ParseUUIDPipe) id: string) {
    const role = await this.permissionsService.getRoleById(id);
    return { data: role };
  }

  @Put('roles/:id')
  @ApiOperation({ summary: 'Update a custom role' })
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const role = await this.permissionsService.updateRole(id, {
      name: dto.name,
      description: dto.description,
      permissionIds: dto.permissionIds,
    });
    return { data: role };
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom role' })
  async deleteRole(@Param('id', ParseUUIDPipe) id: string) {
    await this.permissionsService.deleteRole(id);
  }

  @Post('projects/:projectId/members/:memberId/role')
  @ApiOperation({ summary: 'Assign a role to a project member' })
  async assignRoleToMember(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: AssignRoleDto,
  ) {
    const member = await this.permissionsService.assignRoleToMember(
      memberId,
      dto.roleId,
    );
    return { data: member };
  }

  @Get('projects/:projectId/my-permissions')
  @ApiOperation({ summary: 'Get current user permissions for a specific project' })
  async getMyPermissions(
    @Param('projectId', ResolveProjectPipe) projectId: string,
    @CurrentUser() user: any,
  ) {
    const permissions = await this.permissionsService.getUserPermissionsForProject(
      user.id,
      projectId,
    );
    return { data: permissions };
  }
}
