import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { SamlConfigDto } from '../auth/dto/saml-config.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current organization' })
  async getMyOrg(@OrgId() organizationId: string) {
    return this.organizationsService.findById(organizationId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current organization' })
  @Roles('admin', 'owner')
  async updateMyOrg(@OrgId() organizationId: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.update(organizationId, dto);
  }

  @Get('me/members')
  @ApiOperation({ summary: 'List organization members' })
  async getMembers(@OrgId() organizationId: string) {
    const members = await this.organizationsService.getMembers(organizationId);
    return { data: members };
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a new member to the organization' })
  @Roles('admin', 'owner')
  async inviteMember(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.organizationsService.inviteMember(organizationId, dto, userId);
  }

  @Patch('me/members/:memberId')
  @ApiOperation({ summary: 'Update a member profile info (displayName, avatarUrl)' })
  @Roles('admin', 'owner')
  async updateMember(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
    @Body() dto: { displayName?: string; avatarUrl?: string },
  ) {
    return this.organizationsService.updateMemberInfo(organizationId, memberId, dto, userId);
  }

  @Patch('me/members/:memberId/role')
  @ApiOperation({ summary: 'Update a member role' })
  @Roles('admin', 'owner')
  async updateMemberRole(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(
      organizationId,
      memberId,
      dto.role,
      userId,
    );
  }

  @Patch('me/members/:memberId/deactivate')
  @ApiOperation({ summary: 'Deactivate a member' })
  @Roles('admin', 'owner')
  async deactivateMember(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.organizationsService.deactivateMember(organizationId, memberId, userId);
    return { message: 'Member deactivated' };
  }

  @Post('me/members/:memberId/resend-invite')
  @ApiOperation({ summary: 'Resend invitation email to a pending member' })
  @Roles('admin', 'owner')
  async resendInvitation(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.organizationsService.resendInvitation(organizationId, memberId, userId);
    return { message: 'Invitation resent' };
  }

  @Delete('me/members/:memberId/invite')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @Roles('admin', 'owner')
  async revokeInvitation(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Param('memberId') memberId: string,
  ) {
    await this.organizationsService.revokeInvitation(organizationId, memberId, userId);
    return { message: 'Invitation revoked' };
  }

  // ── SAML SSO Configuration ─────────────────────────────────────────────

  @Get('me/saml-config')
  @ApiOperation({ summary: 'Get SAML SSO configuration for the organization' })
  @Roles('admin', 'owner')
  async getSamlConfig(@OrgId() organizationId: string) {
    const config = await this.organizationsService.getSamlConfig(organizationId);
    return { data: config };
  }

  @Put('me/saml-config')
  @ApiOperation({ summary: 'Set SAML SSO configuration for the organization' })
  @Roles('admin', 'owner')
  async setSamlConfig(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SamlConfigDto,
  ) {
    await this.organizationsService.setSamlConfig(organizationId, dto, userId);
    return { message: 'SAML configuration saved successfully' };
  }

  @Delete('me/saml-config')
  @ApiOperation({ summary: 'Remove SAML SSO configuration for the organization' })
  @Roles('admin', 'owner')
  async deleteSamlConfig(
    @OrgId() organizationId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.organizationsService.deleteSamlConfig(organizationId, userId);
    return { message: 'SAML configuration removed successfully' };
  }
}
