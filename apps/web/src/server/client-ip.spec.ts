// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveClientIp } from './client-ip';

const h = (init: Record<string, string>) => new Headers(init);

describe('resolveClientIp (SEC-114)', () => {
  it('sem proxy confiável configurado, ignora o X-Forwarded-For do navegador', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': '6.6.6.6' }), { hops: 0, header: null })).toBeNull();
    expect(resolveClientIp(h({ 'x-real-ip': '6.6.6.6' }), { hops: 0, header: null })).toBeNull();
  });

  it('com 1 salto confiável usa o último valor, não o primeiro', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }), { hops: 1, header: null })).toBe('2.2.2.2');
  });

  it('com 2 saltos usa o penúltimo', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 2.2.2.2' }), { hops: 2, header: null })).toBe('1.1.1.1');
  });

  it('cadeia menor que os saltos configurados não vale nada', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': '2.2.2.2' }), { hops: 2, header: null })).toBeNull();
  });

  it('usa o cabeçalho que o proxy sobrescreve e ignora o X-Forwarded-For', () => {
    expect(resolveClientIp(h({ 'x-real-ip': '3.3.3.3', 'x-forwarded-for': '6.6.6.6' }), { hops: 0, header: 'x-real-ip' })).toBe('3.3.3.3');
    expect(resolveClientIp(h({ 'x-forwarded-for': '6.6.6.6' }), { hops: 1, header: 'x-real-ip' })).toBeNull();
  });

  it('só aceita IP válido (v4 ou v6) e tira os colchetes', () => {
    expect(resolveClientIp(h({ 'x-forwarded-for': 'lixo, <script>' }), { hops: 1, header: null })).toBeNull();
    expect(resolveClientIp(h({ 'x-forwarded-for': '[2001:db8::1]' }), { hops: 1, header: null })).toBe('2001:db8::1');
  });
});
