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
  },
});
