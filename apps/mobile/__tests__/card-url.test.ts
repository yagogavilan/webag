import { isSecureCardUrl } from '../src/features/checkout/config';

const BASE = 'https://webag.com.br';
const TOKEN = '0123456789abcdef0123';

describe('URL da página segura do cartão (SEC-126)', () => {
  it('aceita só a mesma origem, a rota fixa e o token', () => {
    expect(isSecureCardUrl(`${BASE}/pagar/cartao?i=${TOKEN}`, BASE)).toBe(true);
  });
  it('recusa outro host, outro caminho, token curto, esquema estranho e credenciais na URL', () => {
    expect(isSecureCardUrl(`https://evil.example/pagar/cartao?i=${TOKEN}`, BASE)).toBe(false);
    expect(isSecureCardUrl(`${BASE}/outra?i=${TOKEN}`, BASE)).toBe(false);
    expect(isSecureCardUrl(`${BASE}/pagar/cartao?i=curto`, BASE)).toBe(false);
    expect(isSecureCardUrl(`http://webag.com.br/pagar/cartao?i=${TOKEN}`, BASE)).toBe(false);
    expect(isSecureCardUrl(`javascript:alert(1)`, BASE)).toBe(false);
    expect(isSecureCardUrl(`https://user:pw@webag.com.br/pagar/cartao?i=${TOKEN}`, BASE)).toBe(false);
    expect(isSecureCardUrl('não é url', BASE)).toBe(false);
  });
});
