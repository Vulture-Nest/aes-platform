import { PrismaClient, Role, SiteType, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Reference sites (spec §4 / §1).
  const sites: Array<{ name: string; type: SiteType }> = [
    { name: 'Mimosa', type: SiteType.MINE_SITE },
    { name: 'Unki', type: SiteType.MINE_SITE },
    { name: 'Zimplats', type: SiteType.MINE_SITE },
    { name: 'Head Office', type: SiteType.HEAD_OFFICE },
  ];
  for (const site of sites) {
    await prisma.site.upsert({ where: { name: site.name }, update: {}, create: site });
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
  console.log(`Seeded ${sites.length} sites and SysAdmin <${email}>.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
