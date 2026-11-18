import { describe, expect, it } from 'vitest';
import { areaForPath } from './areas';

describe('areaForPath', () => {
  it.each([
    ['/lojista', 'lojista'],
    ['/lojista/pedidos/123', 'lojista'],
    ['/admin', 'admin'],
    ['/admin/lojas', 'admin'],
  ])('%s pertence à área %s', (path, area) => {
    expect(areaForPath(path)?.id).toBe(area);
  });

  it.each(['/', '/lojistas', '/administracao', '/pagamento/cartao/abc'])(
    '%s não pertence a nenhuma área protegida',
    (path) => {
      expect(areaForPath(path)).toBeUndefined();
    },
  );

  it('cada área exige um papel diferente', () => {
    expect(areaForPath('/lojista')?.requiredRole).toBe('merchant');
    expect(areaForPath('/admin')?.requiredRole).toBe('admin');
  });
});
