import { Recorder, ease, clamp01, installTouchFx, touchFx, rectOf } from './rec.mjs';
export { ease, clamp01, rectOf };
/** elemento rolavel principal da tela (o maior com overflow) */
export async function markScroller(page) {
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.clientHeight > 300 && e.getClientRects().length);
    all.sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
    window.__sc = all[0] ?? null;
    return window.__sc ? { top: window.__sc.scrollTop, max: window.__sc.scrollHeight - window.__sc.clientHeight } : null;
  });
}
export const setScroll = (page, y) => page.evaluate((y) => { if (window.__sc) window.__sc.scrollTop = y; }, y);
export async function imagesReady(page, rec) {
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => [...document.images].filter((im) => im.getClientRects().length).every((im) => im.complete && im.naturalWidth > 0));
    if (ok) return;
    await rec.advance(100);
    await new Promise((r) => setTimeout(r, 100));
  }
}
/** toque com indicador: o dedo aparece, aperta, e solta (a acao roda ao soltar); `after` espera a nova tela antes do dedo sumir */
export async function tapAt(rec, page, x, y, after) {
  await installTouchFx(page);
  await rec.run(0.14, async (t) => touchFx(page, x, y, 1.35 - 0.35 * ease.out(t), 0.95 * ease.out(t)));
  await rec.run(0.12, async (t) => touchFx(page, x, y, 1 - 0.18 * t, 0.95));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await rec.advance(60);
  await page.mouse.up();
  if (after) await after();
  await rec.run(0.2, async (t) => touchFx(page, x, y, 0.82 + 0.5 * ease.out(t), 0.95 * (1 - ease.out(t))));
  await touchFx(page, x, y, 1, 0);
}
export async function scrollBy(rec, page, from, to, seconds, fn = ease.inOut) {
  await rec.run(seconds, async (t) => setScroll(page, from + (to - from) * fn(t)));
  await setScroll(page, to);
}
export { Recorder };
