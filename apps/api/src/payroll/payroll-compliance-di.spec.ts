import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AlertService } from '../command-centre/danger/alert.service';
import { ApprovalService } from '../approvals/approval.service';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import { LedgerService } from '../ledger/ledger.service';
import { StatutoryRatesService } from '../reference/statutory-rates/statutory-rates.service';
import { CryptoService } from '../crypto/crypto.service';
import { GrossBuildupService } from './calculators/gross-buildup.service';
import { NssaService } from './calculators/nssa.service';
import { PayeService } from './calculators/paye.service';
import { CrossCurrencyPayeService } from './calculators/cross-currency-paye.service';
import { EmployerStatutoryService } from './calculators/statutory-employer.service';
import { PayrollService, COMPLIANCE_GENERATOR } from './payroll.service';
import { ComplianceService } from '../compliance/compliance.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Proves the Payroll <-> Compliance forwardRef DI cycle resolves through Nest's container
 * (a mis-wired forwardRef would throw at compile()). All external collaborators are stubbed so
 * no DB/boot side effects run — this is purely a wiring smoke test for G22.
 */
describe('Payroll <-> Compliance DI cycle (G22 wiring)', () => {
  it('resolves both services and injects the compliance generator into payroll', async () => {
    const stub = {} as any;
    const moduleRef = await Test.createTestingModule({
      providers: [
        PayrollService,
        ComplianceService,
        { provide: COMPLIANCE_GENERATOR, useExisting: ComplianceService },
        GrossBuildupService,
        PayeService,
        CrossCurrencyPayeService,
        NssaService,
        EmployerStatutoryService,
        { provide: PrismaService, useValue: stub },
        { provide: AuditService, useValue: stub },
        { provide: AlertService, useValue: stub },
        { provide: ApprovalService, useValue: stub },
        { provide: StatusTransitionRegistry, useValue: new StatusTransitionRegistry() },
        { provide: LedgerService, useValue: stub },
        { provide: StatutoryRatesService, useValue: stub },
        { provide: CryptoService, useValue: { encrypt: () => null, decrypt: () => null } },
      ],
    }).compile();

    const payroll = moduleRef.get(PayrollService);
    const compliance = moduleRef.get(ComplianceService);
    expect(payroll).toBeInstanceOf(PayrollService);
    // The token alias resolves to the same ComplianceService instance.
    expect(moduleRef.get(COMPLIANCE_GENERATOR)).toBe(compliance);
    // Payroll received the compliance generator via forwardRef (not undefined).
    expect((payroll as any).compliance).toBe(compliance);
  });
});
