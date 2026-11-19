import { describe, expect, it } from 'vitest';
import { isPublicSitePath } from './public-paths';

describe('páginas públicas', () => {
  it('reconhece o site e não confunde com painéis nem com a página de cartão', () => {
    for (const p of ['/', '/privacidade', '/termos', '/termos/lojista', '/ajuda', '/suporte', '/excluir-conta', '/licencas', '/ajuda/']) expect(isPublicSitePath(p), p).toBe(true);
    for (const p of ['/admin', '/lojista/entrar', '/pagar/cartao', '/api/public/privacy-request', '/privacidadeX', '/lojista/desistir-da-exclusao']) expect(isPublicSitePath(p), p).toBe(false);
  });
});
