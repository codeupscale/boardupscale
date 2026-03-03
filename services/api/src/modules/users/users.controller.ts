import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OrgId } from '../../common/decorators/org-id.decorator';
import { ParseUUIDPipe } from '../../common/pipes/parse-uuid.pipe';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users in organization' })
  async findAll(@OrgId() organizationId: string) {
    const users = await this.usersService.findByOrg(organizationId);
    return { data: users };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  async getMe(@CurrentUser() user: any) {
    return this.usersService.findById(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  async updateMe(@CurrentUser() user: any, @Body() dto: UpdateUserDto) {
    return this.usersService.update(user.id, dto);
  }

  @Patch('me/language')
  @ApiOperation({ summary: 'Update current user preferred language' })
  async updateLanguage(
    @CurrentUser() user: any,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.usersService.update(user.id, { language: dto.language });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @OrgId() organizationId: string) {
    const user = await this.usersService.findById(id);
    return user;
  }

  @Post('me/change-password')
  @ApiOperation({ summary: 'Change current user password' })
  async changePassword(
    @CurrentUser() user: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    await this.usersService.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
    );
    return { data: { message: 'Password changed successfully' } };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'owner')
  @ApiOperation({ summary: 'Deactivate a user (admin only)' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @OrgId() organizationId: string,
  ) {
    await this.usersService.deactivate(id, organizationId);
    return { data: { message: 'User deactivated successfully' } };
  }
}
