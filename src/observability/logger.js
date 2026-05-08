import pino from 'pino';
import { env } from '../config/env.js';

const loggerOptions = {
  name: env.appName,
  level: env.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'request.headers.authorization',
      'request.headers.cookie',
      'password',
      'token',
      '*.password',
      '*.token'
    ],
    censor: '[redacted]'
  }
};

if (env.logPretty) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      singleLine: false,
      ignore: 'pid,hostname'
    }
  };
}

export const logger = pino(loggerOptions);
