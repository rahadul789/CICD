import { buildSocketMessageInput } from '../controllers/message.controller.js';
import { Message } from '../models/message.model.js';
import { logger } from '../observability/logger.js';
import {
  recordMessageSent,
  recordSocketConnected,
  recordSocketDisconnected
} from '../observability/metrics.js';

const socketLogger = logger.child({ component: 'socket.io' });

export function setupSocketServer(io) {
  io.on('connection', (socket) => {
    const log = socketLogger.child({ socketId: socket.id });
    recordSocketConnected();

    log.info(
      {
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address
      },
      'Socket connected'
    );

    socket.emit('server:welcome', {
      socketId: socket.id,
      message: 'Connected to realtime server',
      timestamp: new Date().toISOString()
    });

    socket.on('message:send', async (payload, acknowledge) => {
      try {
        const input = buildSocketMessageInput(payload);
        const message = await Message.create(input);
        const response = message.toJSON();

        io.emit('message:new', response);
        recordMessageSent(response.source);

        log.info(
          { messageId: response.id, source: response.source },
          'Socket message broadcast'
        );

        if (typeof acknowledge === 'function') {
          acknowledge({ ok: true, data: response });
        }
      } catch (error) {
        const errorPayload = {
          ok: false,
          error: {
            message: error.status ? error.message : 'Failed to send message'
          }
        };

        log.warn({ err: error }, 'Socket message rejected');

        socket.emit('message:error', errorPayload.error);

        if (typeof acknowledge === 'function') {
          acknowledge(errorPayload);
        }
      }
    });

    socket.on('disconnect', (reason) => {
      recordSocketDisconnected();
      log.info({ reason }, 'Socket disconnected');
    });
  });
}
