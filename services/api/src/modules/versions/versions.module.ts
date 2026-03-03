import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VersionsController } from './versions.controller';
import { VersionsService } from './versions.service';
import { Version } from './entities/version.entity';
import { IssueVersion } from './entities/issue-version.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Version, IssueVersion])],
  controllers: [VersionsController],
  providers: [VersionsService],
  exports: [VersionsService],
})
export class VersionsModule {}
