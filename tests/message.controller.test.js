import createError from 'http-errors';
import { buildSocketMessageInput } from '../src/controllers/message.controller.js';

describe('message input validation', () => {
  test('normalizes valid socket message input', () => {
    expect(
      buildSocketMessageInput({
        author: '  Arif  ',
        content: '  Hello  '
      })
    ).toEqual({
      author: 'Arif',
      content: 'Hello',
      source: 'socket'
    });
  });

  test('defaults missing author to Anonymous', () => {
    expect(
      buildSocketMessageInput({
        content: 'Hello'
      })
    ).toEqual({
      author: 'Anonymous',
      content: 'Hello',
      source: 'socket'
    });
  });

  test('rejects empty content with a 400 error', () => {
    expect(() => buildSocketMessageInput({ author: 'Arif', content: '   ' })).toThrow(
      createError.BadRequest
    );
  });
});
