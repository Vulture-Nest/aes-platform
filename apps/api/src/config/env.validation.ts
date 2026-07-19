import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

const toBool = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value);

/**
 * Typed, validated view of process.env. The app refuses to boot if anything here
 * is missing or malformed — fail fast, never run with half-configured secrets.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'info';

  @IsString()
  @IsOptional()
  APP_TIMEZONE = 'Africa/Harare';

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_HOST = 'localhost';

  @Type(() => Number)
  @IsInt()
  REDIS_PORT = 6379;

  @IsString()
  STORAGE_ENDPOINT = 'localhost';

  @Type(() => Number)
  @IsInt()
  STORAGE_PORT = 9000;

  @IsBoolean()
  @Transform(toBool)
  STORAGE_USE_SSL = false;

  @IsString()
  STORAGE_ACCESS_KEY!: string;

  @IsString()
  STORAGE_SECRET_KEY!: string;

  @IsString()
  STORAGE_BUCKET = 'aes-files';

  // --- Auth (local JWT) ---
  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters' })
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL = 900;

  @Type(() => Number)
  @IsInt()
  @Min(300)
  JWT_REFRESH_TTL = 2592000;

  @IsString()
  @IsOptional()
  SEED_ADMIN_EMAIL = 'admin@aes.local';

  @IsString()
  @IsOptional()
  SEED_ADMIN_PASSWORD = 'ChangeMe!123';
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }
  return validated;
}
