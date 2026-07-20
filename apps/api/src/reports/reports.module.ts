import { Module } from '@nestjs/common';
import { CommandCentreModule } from '../command-centre/command-centre.module';
import { PayrollModule } from '../payroll/payroll.module';
import { TimesheetsModule } from '../timesheets/timesheets.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reports & exports (spec §16). Formats existing read-only finance/HR services into
 * downloadable XLSX / PDF / CSV. Imports the owning modules for their exported services;
 * this module adds no new data access of its own.
 */
@Module({
  imports: [CommandCentreModule, PayrollModule, TimesheetsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
