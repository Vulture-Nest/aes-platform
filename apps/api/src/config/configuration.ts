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
});
