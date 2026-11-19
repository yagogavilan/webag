import { describe, expect, it } from 'vitest';
import { canEdit, canOpenStoreDocuments, canView, safeNext, visibleNav } from './admin-access';

describe('matriz de menu do admin (onda-1b §AD0)', () => {
  it('super admin vê tudo e edita o que é editável', () => {
    expect(visibleNav('super_admin').map((i) => i.section)).toEqual(['lojas', 'logistica', 'estornos', 'frete', 'comissoes', 'trocas', 'disputas', 'relatorios', 'banners', 'push', 'cupons', 'moderacao', 'denuncias', 'ajuda', 'regioes', 'categorias', 'parametros', 'flags', 'termos', 'titulares', 'auditoria', 'admins']);
    expect(canEdit('super_admin', 'parametros')).toBe(true);
    expect(canEdit('super_admin', 'auditoria')).toBe(false);
  });

  it('operação edita regiões e categorias, só lê termos e não vê parâmetros, flags nem admins', () => {
    expect(visibleNav('operations').map((i) => i.section)).toEqual(['lojas', 'logistica', 'frete', 'trocas', 'disputas', 'relatorios', 'banners', 'push', 'cupons', 'moderacao', 'denuncias', 'ajuda', 'regioes', 'categorias', 'termos']);
    expect(canEdit('operations', 'regioes')).toBe(true);
    expect(canView('operations', 'termos')).toBe(true);
    expect(canEdit('operations', 'termos')).toBe(false);
  });

  it('suporte vê as lojas sem decidir; financeiro não vê a fila', () => {
    expect(visibleNav('support').map((i) => i.section)).toEqual(['lojas', 'logistica', 'moderacao']);
    expect(canEdit('support', 'lojas')).toBe(false);
    expect(canOpenStoreDocuments('support')).toBe(false);
    expect(canOpenStoreDocuments('operations')).toBe(true);
    expect(visibleNav('finance').map((i) => i.section)).toEqual(['logistica', 'estornos', 'frete', 'comissoes', 'trocas', 'relatorios', 'cupons']);
  });

  it('Onda 6: marketing é só de super e operação; cupons o financeiro lê sem editar; titulares só o super', () => {
    expect(canView('finance', 'banners')).toBe(false);
    expect(canView('support', 'push')).toBe(false);
    expect(canView('finance', 'cupons')).toBe(true);
    expect(canEdit('finance', 'cupons')).toBe(false);
    expect(canView('operations', 'titulares')).toBe(false);
    expect(canView('super_admin', 'titulares')).toBe(true);
    expect(canView('support', 'relatorios')).toBe(false);
  });

  it('sem perfil não vê nada', () => {
    expect(visibleNav(null)).toEqual([]);
  });
});

describe('safeNext', () => {
  it.each([
    ['/admin/regioes', '/admin/regioes'],
    ['/admin/parametros?x=1', '/admin/parametros?x=1'],
  ])('aceita %s', (input, expected) => expect(safeNext(input)).toBe(expected));

  it.each([null, undefined, '', 'https://evil.com', '//evil.com', '/lojista', '/admin//x\\y', '/admin/entrar', '/admin/convite?token=1'])('rejeita %s', (input) => {
    expect(safeNext(input)).toBeNull();
  });
});
