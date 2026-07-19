import { AccountType, Currency, PrismaClient, Role, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Reference sites (spec §4 / §1).
  const sites: Array<{ name: string; type: string }> = [
    { name: 'Mimosa', type: 'MINE_SITE' },
    { name: 'Unki', type: 'MINE_SITE' },
    { name: 'Zimplats', type: 'MINE_SITE' },
    { name: 'Head Office', type: 'HEAD_OFFICE' },
  ];
  for (const site of sites) {
    await prisma.site.upsert({ where: { name: site.name }, update: {}, create: site });
  }

  // Default ledger accounts (spec §S5). Idempotent: matched by (name, currency, siteId).
  // Head-office bank accounts + one petty-cash account per mine site.
  const allSites = await prisma.site.findMany();
  const mineSites = allSites.filter((s) => s.type === 'MINE_SITE');
  const defaultAccounts: Array<{
    name: string;
    type: AccountType;
    currency: Currency;
    siteId: string | null;
  }> = [
    { name: 'Bank USD', type: AccountType.BANK, currency: Currency.USD, siteId: null },
    { name: 'Bank ZWG', type: AccountType.BANK, currency: Currency.ZWG, siteId: null },
    ...mineSites.map((s) => ({
      name: `Petty Cash - ${s.name}`,
      type: AccountType.PETTY_CASH,
      currency: Currency.USD,
      siteId: s.id,
    })),
  ];
  for (const acc of defaultAccounts) {
    const existing = await prisma.account.findFirst({
      where: { name: acc.name, currency: acc.currency, siteId: acc.siteId },
    });
    if (!existing) {
      await prisma.account.create({ data: acc });
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
    where: { userId: admin.id, role: Role.SYS_ADMIN, siteId: null },
  });
  if (!hasAdminRole) {
    await prisma.userSiteRole.create({
      data: { userId: admin.id, role: Role.SYS_ADMIN, siteId: null },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${sites.length} sites, ${defaultAccounts.length} accounts and SysAdmin <${email}>.`,
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
