import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SqlServerConnectionOptions } from 'typeorm/driver/sqlserver/SqlServerConnectionOptions';

type EnvReader = {
  get(key: string): string | undefined;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === '') {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
}

function parsePort(value: string | undefined): number | undefined {
  if (value == null || value.trim() === '') {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function buildBaseMssqlConfig(env: EnvReader): SqlServerConnectionOptions {
  const instanceName = env.get('DB_INSTANCE')?.trim() || undefined;
  const port = parsePort(env.get('DB_PORT'));

  return {
    type: 'mssql',
    host: env.get('DB_HOST') || 'localhost',
    ...(instanceName ? {} : port ? { port } : {}),
    username: env.get('DB_USERNAME'),
    password: env.get('DB_PASSWORD'),
    database: env.get('DB_DATABASE'),
    synchronize: parseBoolean(env.get('DB_SYNCHRONIZE'), false),
    options: {
      encrypt: parseBoolean(env.get('DB_ENCRYPT'), false),
      trustServerCertificate: parseBoolean(
        env.get('DB_TRUST_SERVER_CERTIFICATE'),
        true,
      ),
      ...(instanceName ? { instanceName } : {}),
    },
  };
}

export function buildNestMssqlConfig(env: EnvReader): TypeOrmModuleOptions {
  return {
    ...buildBaseMssqlConfig(env),
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    autoLoadEntities: true,
  };
}

export function buildDataSourceMssqlConfig(
  env: EnvReader,
): SqlServerConnectionOptions {
  return buildBaseMssqlConfig(env);
}
