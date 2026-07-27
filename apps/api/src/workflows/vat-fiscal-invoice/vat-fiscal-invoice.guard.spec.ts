import { BadRequestException } from '@nestjs/common';
import { VatFiscalInvoiceGuard } from './vat-fiscal-invoice.guard';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeGuard() {
  const prisma = { lookupValue: { findUnique: jest.fn() } };
  const guard = new VatFiscalInvoiceGuard(prisma as any);
  return { guard, prisma };
}

describe('VatFiscalInvoiceGuard.isRequired', () => {
  it('defaults to false when the setting row is missing', async () => {
    const { guard, prisma } = makeGuard();
    prisma.lookupValue.findUnique.mockResolvedValue(null);
    await expect(guard.isRequired()).resolves.toBe(false);
  });

  it('is false when the row is inactive', async () => {
    const { guard, prisma } = makeGuard();
    prisma.lookupValue.findUnique.mockResolvedValue({ active: false, metadata: { enabled: true } });
    await expect(guard.isRequired()).resolves.toBe(false);
  });

  it('is true when active and metadata.enabled is true', async () => {
    const { guard, prisma } = makeGuard();
    prisma.lookupValue.findUnique.mockResolvedValue({ active: true, metadata: { enabled: true } });
    await expect(guard.isRequired()).resolves.toBe(true);
  });
});

describe('VatFiscalInvoiceGuard.assertFiscalInvoice', () => {
  it('is a no-op when VAT is not being claimed', async () => {
    const { guard, prisma } = makeGuard();
    await expect(
      guard.assertFiscalInvoice({ vatClaimable: false, attachmentKey: null }),
    ).resolves.toBeUndefined();
    // Never even reads the setting — cheap short-circuit.
    expect(prisma.lookupValue.findUnique).not.toHaveBeenCalled();
  });

  it('is a no-op when an attachment is present', async () => {
    const { guard } = makeGuard();
    await expect(
      guard.assertFiscalInvoice({ vatClaimable: true, attachmentKey: 'attachments/x/inv.pdf' }),
    ).resolves.toBeUndefined();
  });

  it('does NOT throw when VAT is claimed without an attachment but the setting is OFF', async () => {
    const { guard, prisma } = makeGuard();
    prisma.lookupValue.findUnique.mockResolvedValue(null); // setting disabled/default
    await expect(
      guard.assertFiscalInvoice({ vatClaimable: true, attachmentKey: null }),
    ).resolves.toBeUndefined();
  });

  it('throws when VAT is claimed, no attachment, and the setting is ON', async () => {
    const { guard, prisma } = makeGuard();
    prisma.lookupValue.findUnique.mockResolvedValue({ active: true, metadata: { enabled: true } });
    await expect(
      guard.assertFiscalInvoice({ vatClaimable: true, attachmentKey: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
