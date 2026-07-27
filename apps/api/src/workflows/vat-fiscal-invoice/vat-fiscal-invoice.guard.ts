import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * The admin setting (a `threshold_key` lookup) that controls whether a VAT-claimed expense must
 * carry a supporting fiscal invoice (spec §16.5 / G20). It is DISABLED by default so existing
 * flows and tests are unaffected; a SYS_ADMIN turns it on by setting `metadata.enabled = true`
 * (or `metadata.value = true`) on the lookup row.
 */
export const REQUIRE_FISCAL_INVOICE_ON_VAT_KEY = 'require_fiscal_invoice_on_vat';
const SETTING_CATEGORY = 'threshold_key';

/** The subject of a fiscal-invoice check: is VAT being claimed, and is an attachment linked? */
export interface FiscalInvoiceSubject {
  /** True when input VAT is being claimed on this expense/order line. */
  vatClaimable: boolean;
  /**
   * The storage key of the linked fiscal-invoice attachment (as returned by AttachmentsService),
   * or null/undefined when none is attached. A blank string counts as "no attachment".
   */
  attachmentKey?: string | null;
}

/**
 * G20 — configurable mandatory fiscal-invoice attachment on VAT-claimed expenses (spec §16.5).
 *
 * Attachments in this system are storage-key based (AttachmentsService.upload returns a key the
 * owning record stores; there is no separate polymorphic Attachment table). Expense creation
 * itself lives in `src/financial` (owned elsewhere), so this is a REUSABLE guard the expense
 * services call rather than logic embedded there.
 *
 * WIRING (one line each — to be added by the financial module owner):
 *   - OrderExpense:   in OrdersService.addExpense, after resolving the attachment key, call
 *       `await this.vatFiscalInvoice.assertFiscalInvoice({ vatClaimable: dto.vatClaimable ?? false, attachmentKey: dto.attachmentKey });`
 *   - GeneralExpense: in ExpensesService.createGeneral, call the same with `dto.vatClaimable`.
 *   (Both DTOs would gain an optional `attachmentKey` field carrying the uploaded fiscal invoice.)
 *
 * Travel / site-reports NOTE: the same helper can gate their supporting-document requirements —
 * travel retirement receipts (TravelRequest.retirementReceiptsKey) and site-report photo packs —
 * by calling assertFiscalInvoice with the relevant flag/key when those flows want the same rule.
 *
 * The check is a no-op unless the admin setting is enabled, so it is safe to call unconditionally.
 */
@Injectable()
export class VatFiscalInvoiceGuard {
  constructor(private readonly prisma: PrismaService) {}

  /** True when the admin has enabled the mandatory-fiscal-invoice-on-VAT requirement. */
  async isRequired(): Promise<boolean> {
    const row = await this.prisma.lookupValue.findUnique({
      where: {
        category_code: { category: SETTING_CATEGORY, code: REQUIRE_FISCAL_INVOICE_ON_VAT_KEY },
      },
    });
    if (!row || !row.active) {
      return false; // missing / disabled => default OFF
    }
    const meta =
      row.metadata && typeof row.metadata === 'object'
        ? (row.metadata as Record<string, unknown>)
        : {};
    return meta.enabled === true || meta.value === true;
  }

  /**
   * Throw BadRequest when the setting is enabled and a VAT-claimed expense has no linked
   * attachment (fiscal invoice). When the setting is off, or VAT is not being claimed, or an
   * attachment is present, this resolves without error.
   */
  async assertFiscalInvoice(subject: FiscalInvoiceSubject): Promise<void> {
    if (!subject.vatClaimable) {
      return;
    }
    if (subject.attachmentKey && subject.attachmentKey.trim() !== '') {
      return;
    }
    if (await this.isRequired()) {
      throw new BadRequestException(
        'A fiscal invoice attachment is required when claiming input VAT on this expense',
      );
    }
  }
}
