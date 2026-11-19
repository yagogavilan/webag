import { platformFamilyOf } from './users.service.js';

describe('platformFamilyOf (SEC-173)', () => {
  it('reduz o user agent à família e, quando o app informa, à versão', () => {
    expect(platformFamilyOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe('android');
    expect(platformFamilyOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)')).toBe('ios');
    expect(platformFamilyOf('Webag/1.4.0 (iPhone15,2; iOS 17.4)')).toBe('ios;1.4.0');
    expect(platformFamilyOf('Mozilla/5.0 (X11; Linux x86_64) Chrome/124')).toBe('web');
    expect(platformFamilyOf(undefined)).toBeNull();
  });
  it('nunca devolve modelo do aparelho nem versão do sistema', () => {
    expect(platformFamilyOf('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36')).not.toMatch(/SM-S918B|14/);
  });
});
