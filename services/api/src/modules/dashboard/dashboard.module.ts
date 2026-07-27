import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PermissionsModule } from '../permissions/permissions.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardScopeResolver } from './dashboard-scope.resolver';

@Module({
  imports: [ConfigModule, PermissionsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardScopeResolver],
  exports: [DashboardService],
})
export class DashboardModule {}
