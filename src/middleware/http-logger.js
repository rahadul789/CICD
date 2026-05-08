import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { logger } from '../observability/logger.js';

function getIncomingRequestId(req) {
  const header = req.headers['x-request-id'];

  if (Array.isArray(header)) {
    return header[0];
  }

  return header;
}

export const httpLogger = pinoHttp({
  logger,
  genReqId(req, res) {
    const requestId = getIncomingRequestId(req) || randomUUID();
    res.setHeader('x-request-id', requestId);
    return requestId;
  },
  customLogLevel(_req, res, error) {
    if (error || res.statusCode >= 500) {
      return 'error';
    }

    if (res.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },
  customErrorMessage(req, res) {
    return `${req.method} ${req.url} failed with ${res.statusCode}`;
  },
  serializers: {
    req(request) {
      return {
        id: request.id,
        method: request.method,
        url: request.url,
        remoteAddress: request.remoteAddress,
        remotePort: request.remotePort
      };
    },
    res(response) {
      return {
        statusCode: response.statusCode
      };
    },
    err: pino.stdSerializers.err
  }
});
