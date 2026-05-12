import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { Attachment } from './entities/attachment.entity';
import { ActivityModule } from '../activity/activity.module';
import { EventsModule } from '../../websocket/events.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), ActivityModule, EventsModule, PermissionsModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
