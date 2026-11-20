// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { csrfProblem } from './csrf';

const request = (method: string, headers: Record<string, string> = {}) => new Request('http://localhost:3001/api/proxy/admin/x', { method, headers });

describe('csrfProblem', () => {
  it('não exige nada em leituras', () => {
    expect(csrfProblem(request('GET'))).toBeNull();
  });

  it('exige o cabeçalho X-Webag-Client nas escritas', () => {
    expect(csrfProblem(request('POST'))).toBe('missing-client-header');
  });

  it('recusa origem de outro site', () => {
    expect(csrfProblem(request('POST', { 'x-webag-client': 'web', origin: 'https://evil.example', host: 'localhost:3001' }))).toBe('origin-mismatch');
    expect(csrfProblem(request('POST', { 'x-webag-client': 'web', 'sec-fetch-site': 'cross-site' }))).toBe('cross-site');
  });

  it('aceita a mesma origem', () => {
    expect(csrfProblem(request('PATCH', { 'x-webag-client': 'web', origin: 'http://localhost:3001', host: 'localhost:3001' }))).toBeNull();
  });
});
