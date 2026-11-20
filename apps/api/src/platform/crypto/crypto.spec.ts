import { decryptSecret, encryptSecret } from './crypto.js';

describe('segredo cifrado AES-256-GCM (SEC-139)', () => {
  const sealed = () => encryptSecret('token-do-lojista', 'chave-de-teste-com-32-caracteres!!', 'ctx', 'store:1:k1');

  it('cifra e decifra com o mesmo contexto', () => {
    expect(decryptSecret(sealed(), 'chave-de-teste-com-32-caracteres!!', 'ctx', 'store:1:k1')).toBe('token-do-lojista');
  });

  it('recusa AAD diferente (texto trocado de loja)', () => {
    expect(() => decryptSecret(sealed(), 'chave-de-teste-com-32-caracteres!!', 'ctx', 'store:2:k1')).toThrow();
  });

  it('recusa tag truncada (o Node aceitaria 4 a 16 bytes) e tag vazia', () => {
    const [v, iv, tag, ct] = sealed().split('.');
    const short = Buffer.from(tag!, 'base64url').subarray(0, 8).toString('base64url');
    expect(() => decryptSecret([v, iv, short, ct].join('.'), 'chave-de-teste-com-32-caracteres!!', 'ctx', 'store:1:k1')).toThrow('Formato de segredo cifrado inválido');
    expect(() => decryptSecret([v, iv, '', ct].join('.'), 'chave-de-teste-com-32-caracteres!!', 'ctx', 'store:1:k1')).toThrow();
  });
});
