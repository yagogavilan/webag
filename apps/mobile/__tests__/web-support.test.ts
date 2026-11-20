import { svgHidden, svgImage } from '../src/lib/a11y';
import * as webStore from '../src/lib/secure-store.web';

describe('app no navegador (DEC-058, DT-067)', () => {
  it('SVG decorativo: props nativas no celular, aria-hidden na web (sem props que o DOM não conhece)', () => {
    expect(svgHidden(true, 'android')).toEqual({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(svgHidden(false, 'ios')).toEqual({ accessibilityElementsHidden: false, importantForAccessibility: 'yes' });
    expect(svgHidden(true, 'web')).toEqual({ 'aria-hidden': true });
    expect(svgHidden(false, 'web')).toEqual({});
  });

  it('SVG com rótulo: role img na web, accessible + role image no celular', () => {
    expect(svgImage('Webag', 'web')).toEqual({ role: 'img', 'aria-label': 'Webag' });
    expect(svgImage('Webag', 'android')).toEqual({ accessibilityLabel: 'Webag', accessibilityRole: 'image', accessible: true });
  });

  it('sessão na web fica só na memória (nunca em localStorage)', async () => {
    await webStore.setItemAsync('k', 'segredo');
    expect(await webStore.getItemAsync('k')).toBe('segredo');
    expect(typeof globalThis.localStorage === 'undefined' || globalThis.localStorage.getItem('k') === null).toBe(true);
    await webStore.deleteItemAsync('k');
    expect(await webStore.getItemAsync('k')).toBeNull();
  });
});
