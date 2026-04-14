import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { Version } from './entities/version.entity';
import { IssueVersion } from './entities/issue-version.entity';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Version, IssueVersion]), PermissionsModule],
  controllers: [VersionsController],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
