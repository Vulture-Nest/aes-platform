/**
 * One-off data migration: encrypt any legacy plaintext employee bank account numbers at
 * rest (Prompt 10). Idempotent — rows already in the `enc:v1:` form are skipped, so it is
 * safe to re-run. Uses AES-256-GCM with the same format as CryptoService.
 *
 * Run once per environment, AFTER the app-layer encryption is deployed:
 *   DATABASE_URL_OWNER=... PAYROLL_ENCRYPTION_KEY=... \
 *     npx ts-node prisma/scripts/encrypt-account-no.ts
 *
 * Connects as the owner role (DATABASE_URL_OWNER) so it can see/update rows across all
 * sites — a scoped role would be blocked by row-level security.
 */
import { PrismaClient } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function parseKey(raw: string): Buffer {
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PAYROLL_ENCRYPTION_KEY must decode to 32 bytes');
  }
  return key;
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

async function main(): Promise<void> {
  const raw = process.env.PAYROLL_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('PAYROLL_ENCRYPTION_KEY is required');
  }
  const key = parseKey(raw);
  const url = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  try {
    const rows = await prisma.employee.findMany({
      where: { NOT: { accountNo: null } },
      select: { id: true, accountNo: true },
    });
    let migrated = 0;
    for (const row of rows) {
      if (!row.accountNo || row.accountNo.startsWith(PREFIX)) {
        continue;
      }
      await prisma.employee.update({
        where: { id: row.id },
        data: { accountNo: encrypt(row.accountNo, key) },
      });
      migrated += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`Encrypted ${migrated} of ${rows.length} account number(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
