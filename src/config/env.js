import dotenv from 'dotenv';

dotenv.config();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toMinimumNumber(value, fallback, minimum) {
  return Math.max(toNumber(value, fallback), minimum);
}

function toBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseCorsOrigin(value) {
  if (!value || value === '*') {
    return '*';
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'node-observability-deployment-lab',
  port: toNumber(process.env.PORT, 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  logPretty: toBoolean(process.env.LOG_PRETTY, false),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/node_observability_lab',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  enableChaosRoutes: toBoolean(process.env.ENABLE_CHAOS_ROUTES, false),
  chaos: {
    maxDelayMs: toMinimumNumber(process.env.CHAOS_MAX_DELAY_MS, 10000, 0),
    maxCpuMs: toMinimumNumber(process.env.CHAOS_MAX_CPU_MS, 5000, 1),
    maxMemoryMb: toMinimumNumber(process.env.CHAOS_MAX_MEMORY_MB, 100, 1)
  }
};

export const isProduction = env.nodeEnv === 'production';
