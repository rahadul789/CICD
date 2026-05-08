import mongoose from 'mongoose';
import { logger } from '../observability/logger.js';
import { redactMongoUri } from '../utils/mongo-uri.js';

const databaseLogger = logger.child({ component: 'database' });

const readyStateLabels = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting'
};

export async function connectDatabase(mongoUri) {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    databaseLogger.info(
      { readyState: mongoose.connection.readyState },
      'MongoDB connected'
    );
  });

  mongoose.connection.on('disconnected', () => {
    databaseLogger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (error) => {
    databaseLogger.error({ err: error }, 'MongoDB connection error');
  });

  databaseLogger.info({ mongoUri: redactMongoUri(mongoUri) }, 'Connecting to MongoDB');

  await mongoose.connect(mongoUri);
}

export async function disconnectDatabase() {
  databaseLogger.info('Disconnecting MongoDB');
  await mongoose.disconnect();
}

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;

  return {
    readyState,
    status: readyStateLabels[readyState] || 'unknown',
    isReady: readyState === 1
  };
}
