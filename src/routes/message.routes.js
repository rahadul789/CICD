import { Router } from 'express';
import { createMessage, listMessages } from '../controllers/message.controller.js';
import { asyncHandler } from '../middleware/async-handler.js';

export const messageRouter = Router();

messageRouter.get('/', asyncHandler(listMessages));
messageRouter.post('/', asyncHandler(createMessage));
