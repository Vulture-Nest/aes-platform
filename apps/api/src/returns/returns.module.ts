import { Module } from '@nestjs/common';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';
import { WhtController } from './wht.controller';
import { WhtService } from './wht.service';

/**
 * Statutory Returns Hub + WHT (Additional Features — Prompt 27). A filing calendar
 * of statutory returns (PAYE/NSSA/ZIMDEF/NEC/MIPF/NYARADZO/VAT/WHT) with balance +
 * status (DUE/OVERDUE/PARTIAL/PAID) computed on read, remittance capture, plus
 * withholding-tax transactions (payable auto-withhold + suffered credits) resolved
 * against effective-dated WhtRate config. PrismaService/AuditService are global.
 */
@Module({
  controllers: [ReturnsController, WhtController],
  providers: [ReturnsService, WhtService],
  exports: [ReturnsService, WhtService],
})
export class ReturnsModule {}
