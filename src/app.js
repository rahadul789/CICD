import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { httpLogger } from './middleware/http-logger.js';
import { metricsMiddleware } from './middleware/metrics-middleware.js';
import { notFoundHandler } from './middleware/not-found.js';
import { logger } from './observability/logger.js';
import { demoRouter } from './routes/demo.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { indexRouter } from './routes/index.routes.js';
import { messageRouter } from './routes/message.routes.js';
import { metricsRouter } from './routes/metrics.routes.js';

const appLogger = logger.child({ component: 'express-app' });

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(httpLogger);
  app.use(metricsMiddleware);
  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin,
      credentials: true
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/', indexRouter);
  app.use('/metrics', metricsRouter);
  app.use('/health', healthRouter);
  app.use('/api/messages', messageRouter);

  if (env.enableChaosRoutes) {
    appLogger.warn('Chaos routes enabled');
    app.use('/api/demo', demoRouter);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
