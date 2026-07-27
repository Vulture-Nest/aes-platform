import { ApprovalMode, PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

/// Fixed uuid for the default operating entity — MUST match the literal inserted by
/// the 20260727120000_additional_features migration so a fresh DB and an already-
/// migrated DB converge on the same entity id.
const DEFAULT_ENTITY_ID = '00000000-0000-0000-0000-0000000000e1';

async function main(): Promise<void> {
  // Default multinational entity (spec: multinational/entity dimension). Idempotent;
  // matches the migration's fixed-uuid insert so backfills line up.
  const entity = await prisma.entity.upsert({
    where: { id: DEFAULT_ENTITY_ID },
    update: {},
    create: {
      id: DEFAULT_ENTITY_ID,
      name: 'AES Zimbabwe',
      country: 'ZW',
      baseCurrency: 'USD',
      timezone: 'Africa/Harare',
      locale: 'en',
    },
  });

  // Reference sites (spec §4 / §1). Stamped with the default entity.
  const sites: Array<{ name: string; type: string }> = [
    { name: 'Mimosa', type: 'MINE_SITE' },
    { name: 'Unki', type: 'MINE_SITE' },
    { name: 'Zimplats', type: 'MINE_SITE' },
    { name: 'Head Office', type: 'HEAD_OFFICE' },
  ];
  for (const site of sites) {
    await prisma.site.upsert({
      where: { name: site.name },
      update: { entityId: entity.id },
      create: { ...site, entityId: entity.id },
    });
  }

  // Default ledger accounts (spec §S5). Idempotent: matched by (name, currency, siteId).
  // Head-office bank accounts + one petty-cash account per mine site. Types/currencies
  // are strings (the enums were converted to lookup-validated strings in later migrations).
  const allSites = await prisma.site.findMany();
  const mineSites = allSites.filter((s) => s.type === 'MINE_SITE');
  const defaultAccounts: Array<{
    name: string;
    type: string;
    currency: string;
    siteId: string | null;
  }> = [
    { name: 'Bank USD', type: 'BANK', currency: 'USD', siteId: null },
    { name: 'Bank ZWG', type: 'BANK', currency: 'ZWG', siteId: null },
    ...mineSites.map((s) => ({
      name: `Petty Cash - ${s.name}`,
      type: 'PETTY_CASH',
      currency: 'USD',
      siteId: s.id,
    })),
    // G14 double-entry contra/control accounts, one per needed currency. Names match
    // LedgerService.ensureSystemAccount ("System <TYPE> <CCY>") so seed + runtime converge.
    // These are NOT cash types → excluded from cashPosition totals.
    ...(['RECEIVABLE', 'REVENUE', 'PAYABLE', 'DRAWINGS', 'TAX_PAYABLE', 'LOAN_PAYABLE'].flatMap(
      (type) =>
        ['USD', 'ZWG'].map((currency) => ({
          name: `System ${type} ${currency}`,
          type,
          currency,
          siteId: null,
        })),
    ) as Array<{ name: string; type: string; currency: string; siteId: string | null }>),
  ];
  for (const acc of defaultAccounts) {
    const existing = await prisma.account.findFirst({
      where: { name: acc.name, currency: acc.currency, siteId: acc.siteId },
    });
    if (!existing) {
      await prisma.account.create({ data: { ...acc, entityId: entity.id } });
    } else if (!existing.entityId) {
      await prisma.account.update({ where: { id: existing.id }, data: { entityId: entity.id } });
    }
  }

  // Initial SysAdmin (global role). Change the password immediately after first login.
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@aes.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123';
  const passwordHash = await argon2.hash(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash, status: UserStatus.ACTIVE, mfaRequired: true },
  });

  const hasAdminRole = await prisma.userSiteRole.findFirst({
    where: { userId: admin.id, role: 'SYS_ADMIN', siteId: null },
  });
  if (!hasAdminRole) {
    await prisma.userSiteRole.create({
      data: { userId: admin.id, role: 'SYS_ADMIN', siteId: null },
    });
  }

  // G25: baseline approval-matrix so a fresh DB can actually run workflows out of the box.
  // Minimal + global (siteId null). Idempotent: skip-if-a-matching-rule-exists by natural key
  // (module, stepOrder, approverRole, band). Amounts are ceilings; null maxAmount = unbounded.
  const approvalMatrix: Array<{
    module: string;
    stepOrder: number;
    approverRole: string;
    mode: ApprovalMode;
    minAmount: number | null;
    maxAmount: number | null;
  }> = [
    // Requisitions: Site Manager for everything; FD adds a second step above the band.
    { module: 'requisition', stepOrder: 1, approverRole: 'SITE_MANAGER', mode: ApprovalMode.SEQUENTIAL, minAmount: 0, maxAmount: null },
    { module: 'requisition', stepOrder: 2, approverRole: 'FINANCE_DIRECTOR', mode: ApprovalMode.SEQUENTIAL, minAmount: 5000, maxAmount: null },
    // Travel allowances: same shape as requisitions.
    { module: 'travel', stepOrder: 1, approverRole: 'SITE_MANAGER', mode: ApprovalMode.SEQUENTIAL, minAmount: 0, maxAmount: null },
    { module: 'travel', stepOrder: 2, approverRole: 'FINANCE_DIRECTOR', mode: ApprovalMode.SEQUENTIAL, minAmount: 5000, maxAmount: null },
    // Budgets: PARALLEL co-approval by Ops Director AND Finance Director (both must approve).
    { module: 'budget', stepOrder: 1, approverRole: 'OPS_DIRECTOR', mode: ApprovalMode.PARALLEL, minAmount: 0, maxAmount: null },
    { module: 'budget', stepOrder: 1, approverRole: 'FINANCE_DIRECTOR', mode: ApprovalMode.PARALLEL, minAmount: 0, maxAmount: null },
    // Director withdrawals: any second Director co-approves (self-approval blocked by the engine).
    { module: 'director_withdrawal', stepOrder: 1, approverRole: 'DIRECTOR', mode: ApprovalMode.EITHER, minAmount: 0, maxAmount: null },
    // Petty cash: FD approval only above the configured threshold.
    { module: 'petty_cash', stepOrder: 1, approverRole: 'FINANCE_DIRECTOR', mode: ApprovalMode.SEQUENTIAL, minAmount: 100, maxAmount: null },
  ];
  let approvalRowsCreated = 0;
  for (const rule of approvalMatrix) {
    const existing = await prisma.approvalMatrix.findFirst({
      where: {
        module: rule.module,
        stepOrder: rule.stepOrder,
        approverRole: rule.approverRole,
        minAmount: rule.minAmount,
        maxAmount: rule.maxAmount,
        siteId: null,
      },
    });
    if (!existing) {
      await prisma.approvalMatrix.create({
        data: {
          module: rule.module,
          stepOrder: rule.stepOrder,
          approverRole: rule.approverRole,
          mode: rule.mode,
          minAmount: rule.minAmount,
          maxAmount: rule.maxAmount,
          siteId: null,
          active: true,
        },
      });
      approvalRowsCreated += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded entity <${entity.name}>, ${sites.length} sites, ${defaultAccounts.length} accounts, ` +
      `${approvalRowsCreated} approval-matrix rows and SysAdmin <${email}>.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
