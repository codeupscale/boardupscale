import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { Permission } from './entities/permission.entity';
import { Role } from './entities/role.entity';
import { ProjectMember } from '../projects/entities/project-member.entity';
import { User } from '../users/entities/user.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, ProjectMember, User, OrganizationMember])],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
