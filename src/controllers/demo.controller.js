import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import createError from 'http-errors';
import { env } from '../config/env.js';

const retainedBuffers = [];

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function requireConfirmation(req, action) {
  if (req.query.confirm !== 'true') {
    throw createError(
      400,
      `${action} is destructive. Retry with ?confirm=true if you really want to run it.`
    );
  }
}

function getMemorySnapshot() {
  const usage = process.memoryUsage();

  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
}

export function listDemoRoutes(_req, res) {
  res.json({
    status: 'enabled',
    warning:
      'These routes intentionally simulate production failures. Use only in local or controlled environments.',
    guardrails: {
      maxDelayMs: env.chaos.maxDelayMs,
      maxCpuMs: env.chaos.maxCpuMs,
      maxMemoryMb: env.chaos.maxMemoryMb,
      destructiveRoutesRequireConfirm: true
    },
    routes: {
      slow: '/api/demo/slow?ms=3000',
      randomSlow: '/api/demo/random-slow?min=500&max=5000',
      error: '/api/demo/error',
      unhandledError: '/api/demo/unhandled-error?confirm=true',
      crash: '/api/demo/crash?confirm=true',
      cpuSpike: '/api/demo/cpu-spike?ms=1000',
      memoryPressure: '/api/demo/memory-pressure?mb=25',
      retainedMemoryRelease: '/api/demo/memory-release'
    }
  });
}

export async function slowRoute(req, res) {
  const delayMs = clampNumber(req.query.ms, 3000, 0, env.chaos.maxDelayMs);

  req.log.warn({ delayMs }, 'Intentional slow route started');
  await sleep(delayMs);

  res.json({
    status: 'ok',
    type: 'slow',
    waitedMs: delayMs
  });
}

export async function randomSlowRoute(req, res) {
  const min = clampNumber(req.query.min, 500, 0, env.chaos.maxDelayMs);
  const max = clampNumber(req.query.max, 5000, min, env.chaos.maxDelayMs);
  const delayMs = Math.floor(Math.random() * (max - min + 1)) + min;

  req.log.warn({ min, max, delayMs }, 'Intentional random slow route started');
  await sleep(delayMs);

  res.json({
    status: 'ok',
    type: 'random_slow',
    waitedMs: delayMs,
    range: {
      min,
      max
    }
  });
}

export function errorRoute(_req, _res) {
  throw createError(500, 'Intentional demo error');
}

export function unhandledErrorRoute(req, res) {
  requireConfirmation(req, 'Unhandled promise rejection simulation');

  req.log.fatal('Scheduling intentional unhandled promise rejection');

  res.status(202).json({
    status: 'scheduled',
    type: 'unhandled_rejection',
    warning:
      'The process-level unhandledRejection handler should log and stop the server.'
  });

  Promise.reject(new Error('Intentional unhandled promise rejection'));
}

export function crashRoute(req, res) {
  requireConfirmation(req, 'Server crash simulation');

  req.log.fatal('Scheduling intentional server crash');

  res.status(202).json({
    status: 'scheduled',
    type: 'server_crash',
    warning: 'The process-level uncaughtException handler should log and stop the server.'
  });

  res.on('finish', () => {
    setImmediate(() => {
      throw new Error('Intentional server crash');
    });
  });
}

export function cpuSpikeRoute(req, res) {
  const durationMs = clampNumber(req.query.ms, 1000, 1, env.chaos.maxCpuMs);
  const startedAt = performance.now();
  let iterations = 0;

  req.log.warn({ durationMs }, 'Intentional CPU spike started');

  while (performance.now() - startedAt < durationMs) {
    Math.sqrt(iterations * Math.random());
    iterations += 1;
  }

  res.json({
    status: 'ok',
    type: 'cpu_spike',
    durationMs,
    iterations
  });
}

export async function memoryPressureRoute(req, res) {
  const sizeMb = clampNumber(req.query.mb, 25, 1, env.chaos.maxMemoryMb);
  const retain = req.query.retain === 'true';

  if (retain) {
    requireConfirmation(req, 'Retained memory simulation');
  }

  const before = getMemorySnapshot();
  const bytes = sizeMb * 1024 * 1024;
  const buffer = Buffer.alloc(bytes, 1);

  // Keep the buffer alive long enough for memory usage to be observable.
  const checksum = buffer[0] + buffer[buffer.length - 1];

  if (retain) {
    retainedBuffers.push(buffer);
  }

  await sleep(100);

  const after = getMemorySnapshot();

  req.log.warn(
    {
      sizeMb,
      retain,
      retainedChunks: retainedBuffers.length,
      before,
      after
    },
    'Intentional memory pressure completed'
  );

  res.json({
    status: 'ok',
    type: retain ? 'retained_memory' : 'memory_pressure',
    allocatedMb: sizeMb,
    retainedChunks: retainedBuffers.length,
    checksum,
    memory: {
      before,
      after
    }
  });
}

export function releaseMemoryRoute(req, res) {
  const releasedChunks = retainedBuffers.length;
  retainedBuffers.length = 0;

  req.log.warn({ releasedChunks }, 'Retained memory buffers released');

  res.json({
    status: 'ok',
    type: 'memory_release',
    releasedChunks,
    memory: getMemorySnapshot()
  });
}
