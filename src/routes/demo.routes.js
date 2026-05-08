import { Router } from 'express';
import {
  cpuSpikeRoute,
  crashRoute,
  errorRoute,
  listDemoRoutes,
  memoryPressureRoute,
  randomSlowRoute,
  releaseMemoryRoute,
  slowRoute,
  unhandledErrorRoute
} from '../controllers/demo.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const demoRouter = Router();

demoRouter.get('/', listDemoRoutes);
demoRouter.get('/slow', asyncHandler(slowRoute));
demoRouter.get('/random-slow', asyncHandler(randomSlowRoute));
demoRouter.get('/error', errorRoute);
demoRouter.get('/unhandled-error', unhandledErrorRoute);
demoRouter.get('/crash', crashRoute);
demoRouter.get('/cpu-spike', cpuSpikeRoute);
demoRouter.get('/memory-pressure', asyncHandler(memoryPressureRoute));
demoRouter.get('/memory-release', releaseMemoryRoute);
