import { AppError } from '../../../platform/http/app-error.js';
import { etag, parseIfMatch } from './version.js';

describe('If-Match e ETag da versão do produto', () => {
  it('ausente ou vazio não confere (app 1.0)', () => {
    expect(parseIfMatch(undefined)).toBeNull();
    expect(parseIfMatch('')).toBeNull();
  });
  it('aceita só o número entre aspas', () => {
    expect(parseIfMatch('"7"')).toBe(7);
    expect(parseIfMatch('"1234567890"')).toBe(1_234_567_890);
    expect(etag(7)).toBe('"7"');
  });
  it.each(['7', '"0"', '"07"', 'W/"7"', '"7" ', '"-1"', '"12345678901"', '*', '"a"'])('recusa %j com 400', (raw) => {
    expect(() => parseIfMatch(raw)).toThrow(AppError);
    try {
      parseIfMatch(raw);
    } catch (error) {
      expect((error as AppError).getStatus()).toBe(400);
    }
  });
});
