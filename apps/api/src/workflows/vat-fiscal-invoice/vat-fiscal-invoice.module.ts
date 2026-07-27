import { Module } from '@nestjs/common';
import { VatFiscalInvoiceGuard } from './vat-fiscal-invoice.guard';

/**
 * G20 — reusable, configurable fiscal-invoice-on-VAT guard (spec §16.5). Exported so the
 * financial module (order/general expense creation) can inject it at the one-line call sites
 * documented on the guard. PrismaService is global, so no extra imports are needed.
 */
@Module({
  providers: [VatFiscalInvoiceGuard],
  exports: [VatFiscalInvoiceGuard],
})
export class VatFiscalInvoiceModule {}
