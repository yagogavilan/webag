import { describe, expect, it } from 'vitest';
import { averageLuminance, clampOffset, cropRect, displayScale, fitWithin, formatBytes, validateDocumentFile, zoomAround, type CropView } from './prepare';

const MB = 1024 * 1024;

describe('validação do arquivo de documento (WB-052 C2)', () => {
  it('aceita JPG, PNG e PDF até 5 MB', () => {
    expect(validateDocumentFile({ name: 'a.jpg', type: 'image/jpeg', size: 2 * MB })).toBeNull();
    expect(validateDocumentFile({ name: 'a.png', type: 'image/png', size: 5 * MB })).toBeNull();
    expect(validateDocumentFile({ name: 'a.pdf', type: 'application/pdf', size: 1 })).toBeNull();
  });
  it('recusa arquivo grande com o tamanho real e tipo errado com a instrução', () => {
    expect(validateDocumentFile({ name: 'a.pdf', type: 'application/pdf', size: 8 * MB })).toBe('Esse arquivo tem 8 MB. O máximo é 5 MB.');
    expect(validateDocumentFile({ name: 'a.svg', type: 'image/svg+xml', size: 10 })).toBe('Use uma foto (JPG ou PNG) ou PDF.');
    expect(validateDocumentFile({ name: 'a.gif', type: 'image/gif', size: 10 })).toBe('Use uma foto (JPG ou PNG) ou PDF.');
    expect(validateDocumentFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).toContain('vazio');
  });
  it('SVG renomeado .jpg sem tipo declarado passa pelo cliente: a API confere o conteúdo (SEC-050)', () => {
    expect(validateDocumentFile({ name: 'x.jpg', type: '', size: 10 })).toBeNull();
  });
  it('formata tamanhos', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1.5 * MB)).toBe('1,5 MB');
  });
});

describe('geometria de redução', () => {
  it('reduz pelo lado maior e mantém a proporção; não amplia', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it('luminância: preto é escuro, branco é claro', () => {
    expect(averageLuminance([0, 0, 0, 255, 0, 0, 0, 255])).toBe(0);
    expect(averageLuminance([255, 255, 255, 255])).toBeCloseTo(255, 0);
    expect(averageLuminance([])).toBe(255);
  });
});

const view = (over: Partial<CropView> = {}): CropView => ({ imageWidth: 2000, imageHeight: 1500, frameWidth: 400, frameHeight: 300, zoom: 1, offsetX: 0, offsetY: 0, ...over });

describe('recorte (moldura fixa, imagem móvel)', () => {
  it('em zoom 1 a imagem cobre a moldura e o recorte é a imagem inteira', () => {
    expect(displayScale(view())).toBeCloseTo(0.2);
    expect(cropRect(view())).toEqual({ x: 0, y: 0, width: 2000, height: 1500 });
  });
  it('com zoom 2 o recorte é metade da imagem, no ponto deslocado', () => {
    const v = view({ zoom: 2, offsetX: -200, offsetY: -100 });
    const rect = cropRect(v);
    expect(rect.width).toBeCloseTo(1000);
    expect(rect.height).toBeCloseTo(750);
    expect(rect.x).toBeCloseTo(500);
    expect(rect.y).toBeCloseTo(250);
  });
  it('não deixa arrastar além da borda (nunca aparece vazio)', () => {
    const clamped = clampOffset(view({ zoom: 2, offsetX: 50, offsetY: -9999 }));
    expect(clamped.offsetX).toBe(0);
    expect(clamped.offsetY).toBe(-300);
  });
  it('zoom mantém o centro no lugar e respeita os limites 1 a 4', () => {
    const base = view({ zoom: 2, offsetX: -200, offsetY: -150 });
    const next = zoomAround(base, 3);
    expect(next.zoom).toBe(3);
    const before = cropRect(base);
    const after = cropRect(next);
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 0);
    expect(zoomAround(base, 99).zoom).toBe(4);
    expect(zoomAround(base, 0.1).zoom).toBe(1);
  });
});
