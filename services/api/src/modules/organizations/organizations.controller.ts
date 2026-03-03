import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  async inviteMember(@OrgId() organizationId: string, @Body() dto: InviteMemberDto) {
    return this.organizationsService.inviteMember(organizationId, dto);
  }
}
