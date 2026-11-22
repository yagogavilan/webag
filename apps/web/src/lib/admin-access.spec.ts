import { describe, expect, it } from 'vitest';
import { bottomNav, canEdit, canOpenStoreDocuments, canView, safeNext, visibleNav } from './admin-access';

describe('matriz de menu do admin (onda-1b §AD0)', () => {
  it('super admin vê tudo e edita o que é editável', () => {
    expect(visibleNav('super_admin').map((i) => i.section)).toEqual(['inicio', 'alertas', 'logistica', 'pedidos', 'lojas', 'usuarios', 'disputas', 'estornos', 'moderacao', 'denuncias', 'ajuda', 'comissoes', 'frete', 'relatorios', 'trocas', 'banners', 'cupons', 'push', 'regioes', 'categorias', 'parametros_entrega', 'parametros', 'manutencao', 'flags', 'termos', 'titulares', 'auditoria', 'admins']);
    expect(canEdit('super_admin', 'parametros')).toBe(true);
    expect(canEdit('super_admin', 'auditoria')).toBe(false);
  });

  it('operação edita regiões e categorias, só lê termos e não vê parâmetros, flags nem admins', () => {
    expect(visibleNav('operations').map((i) => i.section)).toEqual(['inicio', 'alertas', 'logistica', 'pedidos', 'lojas', 'usuarios', 'disputas', 'moderacao', 'denuncias', 'ajuda', 'frete', 'relatorios', 'trocas', 'banners', 'cupons', 'push', 'regioes', 'categorias', 'termos']);
    expect(canEdit('operations', 'regioes')).toBe(true);
    expect(canView('operations', 'termos')).toBe(true);
    expect(canEdit('operations', 'termos')).toBe(false);
  });

  it('suporte e financeiro veem as lojas sem decidir (WB-355: stores:read é dos 4 perfis)', () => {
    expect(visibleNav('support').map((i) => i.section)).toEqual(['inicio', 'alertas', 'logistica', 'pedidos', 'lojas', 'usuarios', 'moderacao']);
    expect(canEdit('support', 'lojas')).toBe(false);
    expect(canOpenStoreDocuments('support')).toBe(false);
    expect(canOpenStoreDocuments('operations')).toBe(true);
    expect(visibleNav('finance').map((i) => i.section)).toEqual(['inicio', 'alertas', 'logistica', 'pedidos', 'lojas', 'estornos', 'comissoes', 'frete', 'relatorios', 'trocas', 'cupons']);
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

describe('B3, B4, B5 e manutenção (DEC-073/074)', () => {
  it('usuários: super admin e operação bloqueiam; o suporte só consulta; o financeiro não vê', () => {
    expect(canView('support', 'usuarios')).toBe(true);
    expect(canEdit('support', 'usuarios')).toBe(false);
    expect(canEdit('operations', 'usuarios')).toBe(true);
    expect(canView('finance', 'usuarios')).toBe(false);
  });
  it('pedidos: todos leem; só financeiro e super admin cancelam e estornam (operação não)', () => {
    for (const profile of ['super_admin', 'operations', 'finance', 'support'] as const) expect(canView(profile, 'pedidos')).toBe(true);
    expect(canEdit('operations', 'pedidos')).toBe(false);
    expect(canEdit('support', 'pedidos')).toBe(false);
    expect(canEdit('finance', 'pedidos')).toBe(true);
    expect(canEdit('super_admin', 'pedidos')).toBe(true);
  });
  it('alertas: todos leem, o suporte não encerra; manutenção só do super admin', () => {
    expect(canView('support', 'alertas')).toBe(true);
    expect(canEdit('support', 'alertas')).toBe(false);
    expect(canEdit('finance', 'alertas')).toBe(true);
    expect(canView('operations', 'manutencao')).toBe(false);
    expect(canEdit('super_admin', 'manutencao')).toBe(true);
  });
});

describe('barra de baixo do celular por perfil (onda-7-navegacao §3.2)', () => {
  const bar = (profile: Parameters<typeof bottomNav>[0]) => bottomNav(profile).map((i) => i.section);
  const more = (profile: Parameters<typeof bottomNav>[0]) => visibleNav(profile).map((i) => i.section).filter((section) => !bar(profile).includes(section));

  it('super admin e operação: Início, Logística, Lojas e Disputas; o resto em "Mais", sem duplicar', () => {
    for (const profile of ['super_admin', 'operations'] as const) {
      expect(bar(profile)).toEqual(['inicio', 'logistica', 'lojas', 'disputas']);
      expect(more(profile)).not.toContain('logistica');
      expect(more(profile).length + bar(profile).length).toBe(visibleNav(profile).length);
    }
    expect(more('super_admin')).toContain('parametros_entrega');
    expect(more('operations')).not.toContain('parametros_entrega');
  });

  it('financeiro: Início, Estornos, Comissões e Relatórios; suporte: Início, Lojas, Logística e Moderação', () => {
    expect(bar('finance')).toEqual(['inicio', 'estornos', 'comissoes', 'relatorios']);
    expect(more('finance')).toContain('logistica');
    expect(bar('support')).toEqual(['inicio', 'lojas', 'logistica', 'moderacao']);
    expect(more('support')).toEqual(['alertas', 'pedidos', 'usuarios']);
  });

  it('o parâmetro de entrega só aparece para o super admin', () => {
    expect(canView('operations', 'parametros_entrega')).toBe(false);
    expect(canView('super_admin', 'parametros_entrega')).toBe(true);
  });

  it('sem perfil, barra vazia', () => {
    expect(bar(null)).toEqual([]);
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
