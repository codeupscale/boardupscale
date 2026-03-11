import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PagesController } from './pages.controller';
import { PagesService } from './pages.service';
import { Page } from './entities/page.entity';
import { ProjectsModule } from '../projects/projects.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsModule } from '../../websocket/events.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Page]),
    BullModule.registerQueue({ name: 'search-index' }),
    ProjectsModule,
    PermissionsModule,
    EventsModule,
    UsersModule,
  ],
  controllers: [PagesController],
  providers: [PagesService],
  exports: [PagesService],
})
export class PagesModule {}
