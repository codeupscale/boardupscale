import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKey } from './entities/api-key.entity';
import { OrganizationMember } from '../organizations/entities/organization-member.entity';
import { ApiKeyStrategy } from './strategies/api-key.strategy';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApiKey, OrganizationMember]),
    PassportModule,
    PermissionsModule,
  ],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyStrategy],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
