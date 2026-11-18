import { PasswordService } from './password.service.js';
import { COMMON_PASSWORDS } from './common-passwords.js';

describe('PasswordService (SEC-001)', () => {
  const service = new PasswordService();

  it('lista de senhas comuns tem pelo menos 10 mil entradas', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(10_000);
  });

  it('gera Argon2id com m=19456, t=2, p=1', async () => {
    const hash = await service.hash('uma-senha-bem-longa-9');
    expect(hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$')).toBe(true);
    expect(await service.verify(hash, 'uma-senha-bem-longa-9')).toBe(true);
    expect(await service.verify(hash, 'outra-senha')).toBe(false);
  });

  it('recusa senhas comuns, curtas e longas demais com 422', () => {
    for (const weak of ['12345678', 'senha123', 'Senha123', 'curta', 'a'.repeat(129)]) {
      expect(() => service.assertPolicy(weak, 8)).toThrowError(expect.objectContaining({ code: 'WEAK_PASSWORD' }) as Error);
    }
  });

  it('aceita 128 caracteres e senha forte', () => {
    expect(() => service.assertPolicy('x7Qm'.repeat(32), 8)).not.toThrow();
    expect(() => service.assertPolicy('cavalo-bateria-grampo-certo', 8)).not.toThrow();
  });

  it('senha inexistente também gasta tempo de hash (verificação com hash nulo é falsa)', async () => {
    expect(await service.verify(null, 'qualquer-coisa-aqui')).toBe(false);
  });
});
