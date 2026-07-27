import { PrismaClient, UserStatus } from '@prisma/client';
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

  // eslint-disable-next-line no-console
  console.log(
    `Seeded entity <${entity.name}>, ${sites.length} sites, ${defaultAccounts.length} accounts and SysAdmin <${email}>.`,
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
