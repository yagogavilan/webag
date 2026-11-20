import { Linking } from 'react-native';
import { isAllowedExternalUrl, isSafeMailAddress, LICENSE_HOSTS, openExternal, openMailto, webPageUrl, type LinkContext } from '../src/features/legal/open-link';
import { CREDITS } from '../src/legal/credits';

const prod: LinkContext = { web: 'https://webag.com.br', api: 'https://api.webag.com.br', allowHttp: false };
const dev: LinkContext = { web: 'http://localhost:3001', api: 'http://localhost:3000', allowHttp: true };

describe('Abertura de links externos (SEC-172, M.3)', () => {
  it('web: só a origem configurada, em https', () => {
    expect(isAllowedExternalUrl('https://webag.com.br/termos', 'web', prod)).toBe(true);
    expect(isAllowedExternalUrl('http://webag.com.br/termos', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://evil.example/termos', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://webag.com.br.evil.example/termos', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://webag.com.br@evil.example/termos', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('javascript:alert(1)', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('intent://x#Intent;end', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('não é url', 'web', prod)).toBe(false);
  });

  it('http só no desenvolvimento (localhost)', () => {
    expect(isAllowedExternalUrl('http://localhost:3001/licencas', 'web', dev)).toBe(true);
    expect(isAllowedExternalUrl('http://localhost:3001/licencas', 'web', prod)).toBe(false);
    expect(isAllowedExternalUrl('http://localhost:3000/v1/x?t=1', 'api', dev)).toBe(true);
  });

  it('api: o link de download é da origem da API, nunca de outra', () => {
    expect(isAllowedExternalUrl('https://api.webag.com.br/v1/downloads/abc?t=1', 'api', prod)).toBe(true);
    expect(isAllowedExternalUrl('https://api.webag.com.br.evil.example/x', 'api', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://webag.com.br/v1/x', 'api', prod)).toBe(false);
    expect(isAllowedExternalUrl('http://api.webag.com.br/v1/x', 'api', prod)).toBe(false);
  });

  it('whatsapp: wa.me com número; maps: busca do Google; cartão: página segura', () => {
    expect(isAllowedExternalUrl('https://wa.me/5511999998888?text=Oi', 'whatsapp', prod)).toBe(true);
    expect(isAllowedExternalUrl('https://wa.me.evil.example/5511999998888', 'whatsapp', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://wa.me/abc', 'whatsapp', prod)).toBe(false);
    expect(isAllowedExternalUrl('http://wa.me/5511999998888', 'whatsapp', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://www.google.com/maps/search/?api=1&query=Rua%20A', 'maps', prod)).toBe(true);
    expect(isAllowedExternalUrl('https://www.google.com/url?q=https://evil.example', 'maps', prod)).toBe(false);
    expect(isAllowedExternalUrl('https://webag.com.br/pagar/cartao?i=0123456789abcdef', 'card', prod)).toBe(true);
    expect(isAllowedExternalUrl('https://evil.example/pagar/cartao?i=0123456789abcdef', 'card', prod)).toBe(false);
  });

  it('toda licença de credits.ts está num domínio permitido; outros domínios não', () => {
    for (const c of CREDITS) expect(isAllowedExternalUrl(c.licenseUrl, 'license', prod)).toBe(true);
    expect(LICENSE_HOSTS.length).toBeGreaterThan(0);
    expect(isAllowedExternalUrl('https://evil.example/LICENSE', 'license', prod)).toBe(false);
    expect(isAllowedExternalUrl('http://creativecommons.org/licenses/by/4.0/', 'license', prod)).toBe(false);
  });

  it('openExternal não chama o sistema para destino recusado e devolve false', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    expect(await openExternal('https://evil.example/x', 'api')).toBe(false);
    expect(await openExternal('javascript:alert(1)')).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('mailto: só endereço simples (sem parâmetros injetados) e corpo codificado', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as never);
    expect(isSafeMailAddress('dpo@webag.com.br')).toBe(true);
    expect(isSafeMailAddress('a@b.com?cc=x@y.com')).toBe(false);
    expect(isSafeMailAddress('a@b.com,c@d.com')).toBe(false);
    expect(await openMailto('a@b.com?cc=x@y.com')).toBe(false);
    expect(await openMailto(null)).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(await openMailto('dpo@webag.com.br', 'olá & tchau')).toBe(true);
    expect(open).toHaveBeenCalledWith('mailto:dpo@webag.com.br?body=ol%C3%A1%20%26%20tchau');
    open.mockRestore();
  });
});

describe('Política de trocas e reembolsos (DEC-081)', () => {
  it('é página pública do Webag: abre só pela origem configurada', () => {
    const url = webPageUrl('/termos/trocas', 'https://webag.com.br');
    expect(url).toBe('https://webag.com.br/termos/trocas');
    expect(isAllowedExternalUrl(url, 'web', prod)).toBe(true);
    expect(isAllowedExternalUrl('https://evil.example/termos/trocas', 'web', prod)).toBe(false);
  });
});
