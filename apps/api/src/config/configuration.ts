/**
 * Structured config assembled from validated environment variables.
 * Injected via ConfigService<AppConfig, true> for type-safe reads.
 */
export interface AppConfig {
  env: string;
  port: number;
  logLevel: string;
  timezone: string;
  database: { url: string };
  redis: { host: string; port: number };
  storage: {
    endpoint: string;
    port: number;
    useSSL: boolean;
    accessKey: string;
    secretKey: string;
    bucket: string;
  };
  auth: {
    jwtSecret: string;
    accessTtl: number;
    refreshTtl: number;
    seedAdminEmail: string;
    seedAdminPassword: string;
  };
  timesheets: {
    /** Configurable ceiling on total hours captured against a single employee-day. */
    maxHoursPerDay: number;
  };
  scheduler: {
    /** In-process cron jobs (danger eval, pending-funds re-test). Off in tests/CI. */
    enabled: boolean;
    /** Approval SLA: reminder after T1 hours, escalate to directors after T2 hours. */
    approvalT1Hours: number;
    approvalT2Hours: number;
  };
  security: {
    /** AES-256-GCM key (hex or base64, 32 bytes) for encrypting sensitive columns at rest. */
    encryptionKey: string | null;
  };
  notifications: {
    /**
     * External delivery transports (G7). Every value is OPTIONAL — when a channel's
     * credentials are absent the corresponding transport reports enabled=false and
     * no-ops, so the app boots and tests run with zero mail/Teams/FCM env.
     */
    mail: {
      /** Full SMTP connection URL (smtp://user:pass@host:port). Takes precedence over host/port. */
      smtpUrl: string | null;
      host: string | null;
      port: number | null;
      /** Use TLS on connect (true for port 465). */
      secure: boolean;
      user: string | null;
      pass: string | null;
      /** From header, e.g. "AES Platform <no-reply@aes.local>". */
      from: string | null;
    };
    /** Microsoft Teams Incoming Webhook URL (posts a MessageCard). */
    teamsWebhookUrl: string | null;
    /** Firebase service-account credential: a JSON file path or an inline JSON string. */
    fcmServiceAccountJson: string | null;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  timezone: process.env.APP_TIMEZONE ?? 'Africa/Harare',
  database: {
    url: process.env.DATABASE_URL as string,
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT ?? 'localhost',
    port: parseInt(process.env.STORAGE_PORT ?? '9000', 10),
    useSSL: (process.env.STORAGE_USE_SSL ?? 'false').toLowerCase() === 'true',
    accessKey: process.env.STORAGE_ACCESS_KEY as string,
    secretKey: process.env.STORAGE_SECRET_KEY as string,
    bucket: process.env.STORAGE_BUCKET ?? 'aes-files',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET as string,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
    seedAdminEmail: process.env.SEED_ADMIN_EMAIL ?? 'admin@aes.local',
    seedAdminPassword: process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!123',
  },
  timesheets: {
    maxHoursPerDay: parseInt(process.env.TIMESHEET_MAX_HOURS_PER_DAY ?? '24', 10),
  },
  scheduler: {
    enabled: (process.env.SCHEDULER_ENABLED ?? 'true').toLowerCase() !== 'false',
    approvalT1Hours: parseInt(process.env.APPROVAL_SLA_T1_HOURS ?? '24', 10),
    approvalT2Hours: parseInt(process.env.APPROVAL_SLA_T2_HOURS ?? '48', 10),
  },
  security: {
    encryptionKey: process.env.PAYROLL_ENCRYPTION_KEY || null,
  },
  notifications: {
    mail: {
      smtpUrl: process.env.MAIL_SMTP_URL || null,
      host: process.env.MAIL_HOST || null,
      port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : null,
      secure: (process.env.MAIL_SECURE ?? 'false').toLowerCase() === 'true',
      user: process.env.MAIL_USER || null,
      pass: process.env.MAIL_PASS || null,
      from: process.env.MAIL_FROM || null,
    },
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL || null,
    fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON || null,
  },
});
