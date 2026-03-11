import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelemetryService } from './telemetry.service';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Organization, User])],
  providers: [TelemetryService],
})
export class TelemetryModule {}
