import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { PermissionsModule } from '../permissions/permissions.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    PermissionsModule,
  ],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
