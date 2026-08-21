// Demo/showcase users — the role-based test accounts documented in
// docs/E2E_TEST_PLAN.md §2. Idempotent (upsert by email + role). Run with a
// DATABASE_URL that can write (owner role):
//
//   DATABASE_URL=postgresql://aes:PASS@host:25060/aes?sslmode=require \
//   npx ts-node prisma/demo-users.ts
//
import { PrismaClient, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Mimosa site — the Site Manager & Clerk are scoped to it (per §2 "Site scoping").
const MIMOSA_ID = '4c1978e8-0f64-411c-bf58-612432249b78';

type Demo = { email: string; password: string; role: string; siteId: string | null };

const DEMO_USERS: Demo[] = [
  { email: 'fd@aes.local', password: 'FdPassword!123', role: 'FINANCE_DIRECTOR', siteId: null },
  { email: 'fo@aes.local', password: 'AesTest!234', role: 'FINANCE_OFFICER', siteId: null },
  { email: 'od@aes.local', password: 'AesTest!234', role: 'OPS_DIRECTOR', siteId: null },
  { email: 'director@aes.local', password: 'AesTest!234', role: 'DIRECTOR', siteId: null },
  { email: 'sitemgr@aes.local', password: 'AesTest!234', role: 'SITE_MANAGER', siteId: MIMOSA_ID },
  { email: 'clerk@aes.local', password: 'AesTest!234', role: 'SITE_CLERK', siteId: MIMOSA_ID },
  { email: 'opsstaff@aes.local', password: 'AesTest!234', role: 'OPS_STAFF', siteId: null },
  { email: 'auditor@aes.local', password: 'AesTest!234', role: 'AUDITOR', siteId: null },
];

async function main(): Promise<void> {
  for (const u of DEMO_USERS) {
    const passwordHash = await argon2.hash(u.password);
    // mfaRequired:false so demo logins are frictionless.
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { passwordHash, status: UserStatus.ACTIVE, mfaRequired: false },
      create: { email: u.email, passwordHash, status: UserStatus.ACTIVE, mfaRequired: false },
    });
    const existing = await prisma.userSiteRole.findFirst({
      where: { userId: user.id, role: u.role, siteId: u.siteId },
    });
    if (!existing) {
      await prisma.userSiteRole.create({ data: { userId: user.id, role: u.role, siteId: u.siteId } });
    }
    const scope = u.siteId ? 'Mimosa' : 'Global';
    // eslint-disable-next-line no-console
    console.log(`  ${u.email.padEnd(22)} ${u.role.padEnd(18)} ${scope}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\nSeeded ${DEMO_USERS.length} demo users (+ admin@aes.local already exists).`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
