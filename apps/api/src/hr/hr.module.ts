import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';

/**
 * HR-lite employee master (spec §12 / Prompt 9). PrismaService, AuditService and
 * NotificationService are provided globally. EmployeesService is exported so the
 * timesheets and (later) payroll modules can resolve site rosters and pay config.
 */
@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class HrModule {}
