import createError from 'http-errors';
import { Message } from '../models/message.model.js';
import { recordMessageSent } from '../observability/metrics.js';

function normalizeMessageInput(body, source) {
  return {
    author: String(body.author || 'Anonymous').trim(),
    content: String(body.content || '').trim(),
    source
  };
}

function validateMessageInput(input) {
  if (!input.author) {
    throw createError(400, 'Author is required');
  }

  if (!input.content) {
    throw createError(400, 'Content is required');
  }

  return input;
}

export async function listMessages(req, res) {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const messages = await Message.find().sort({ createdAt: -1 }).limit(limit).lean();

  res.json({
    data: messages.reverse(),
    meta: {
      count: messages.length,
      limit
    }
  });
}

export async function createMessage(req, res) {
  const input = validateMessageInput(normalizeMessageInput(req.body, 'api'));
  const message = await Message.create(input);
  const payload = message.toJSON();

  const io = req.app.get('io');
  if (io) {
    io.emit('message:new', payload);
  }

  recordMessageSent(payload.source);

  req.log.info(
    { messageId: payload.id, source: payload.source },
    'Message created via API'
  );

  res.status(201).json({ data: payload });
}

export function buildSocketMessageInput(payload) {
  return validateMessageInput(normalizeMessageInput(payload || {}, 'socket'));
}
