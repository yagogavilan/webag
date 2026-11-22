// Gravador de clipes: tempo virtual (Emulation.setVirtualTimePolicy) avancando 1/fps por quadro + screenshot PNG -> ffmpeg (H.264, yuv420p, 30 fps).
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};
export const clamp01 = (t) => Math.max(0, Math.min(1, t));
export class Recorder {
  constructor(page, cdp, { out, fps = 30, scaleTo = null, crf = 21, clip = null }) {
    Object.assign(this, { page, cdp, out, fps, scaleTo, crf, clip, frames: 0 });
  }
  async begin() {
    const vf = [this.scaleTo ? `scale=${this.scaleTo}:flags=lanczos` : null, 'scale=in_range=full:out_range=tv:out_color_matrix=bt709', 'format=yuv420p'].filter(Boolean).join(',');
    this.ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(this.fps), '-c:v', 'png', '-i', 'pipe:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(this.crf), '-profile:v', 'high', '-r', String(this.fps), '-g', '60', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', '-movflags', '+faststart', '-map_metadata', '-1', this.out], { stdio: ['pipe', 'ignore', 'pipe'] });
    this.err = '';
    this.ff.stderr.on('data', (c) => (this.err += c));
    this.ff.stdin.on('error', () => {});
    this.done = new Promise((r) => this.ff.on('close', r));
    this.vtOn = false;
  }
  /** tempo real (sem relogio virtual: o hang do screenshot sob tempo virtual nao se resolve); o movimento do video vem do indice do quadro, nao do relogio */
  async advance(ms) {
    await new Promise((r) => setTimeout(r, Math.min(ms, 40)));
  }
  async vtPause() {}
  /** um quadro: avanca 1/fps no relogio virtual e grava a captura */
  async frame() {
    await this.advance(1000 / this.fps); if (process.env.DBG) console.log('frame', this.frames);
    const shot = await this.capture();
    const buf = Buffer.from(shot.data, 'base64');
    if (!this.ff.stdin.write(buf)) await new Promise((r) => this.ff.stdin.once('drain', r));
    this.frames++;
  }
  async capture() {
    for (let attempt = 0; attempt < 8; attempt++) {
      const res = await Promise.race([this.cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, ...(this.clip ? { clip: this.clip } : {}) }), new Promise((r) => setTimeout(() => r(null), 2500))]);
      if (res) return res;
      this.stalls = (this.stalls ?? 0) + 1;
      await this.advance(8);
    }
    const alive = await Promise.race([this.page.evaluate(() => [performance.now(), document.visibilityState, document.hasFocus(), window.__sc ? window.__sc.scrollTop : null]), new Promise((r) => setTimeout(() => r('evaluate travou'), 3000))]);
    console.log('DIAG', JSON.stringify(alive));
    throw new Error('captureScreenshot travou');
  }
  /** roda `n` quadros; `fn(i, n)` atualiza a pagina antes de cada captura */
  async run(seconds, fn) {
    const n = Math.round(seconds * this.fps);
    for (let i = 0; i < n; i++) {
      if (fn) await fn(i / Math.max(1, n - 1), i, n);
      await this.frame();
    }
  }
  /** tempo que passa sem gravar (esperas de rede): avanca o relogio e dorme de verdade */
  async settle(ms = 600, steps = 6) {
    for (let i = 0; i < steps; i++) {
      await this.advance(ms / steps);
      await new Promise((r) => setTimeout(r, 60));
    }
  }
  async untilVisible(selector, { max = 60 } = {}) {
    for (let i = 0; i < max; i++) {
      if (await this.page.evaluate((s) => !!document.querySelector(s) && document.querySelector(s).getClientRects().length > 0, selector)) return true;
      await this.advance(200);
      await new Promise((r) => setTimeout(r, 120));
    }
    throw new Error('nao apareceu: ' + selector);
  }
  async end() {
    this.ff.stdin.end();
    const code = await this.done;
    if (code !== 0) throw new Error('ffmpeg ' + code + ' ' + this.err);
    return { frames: this.frames, bytes: statSync(this.out).size };
  }
}

// ---------- sobreposicoes (indicador de toque no app; cursor no painel)
export async function installTouchFx(page) {
  await page.evaluate(() => {
    if (document.getElementById('__fx')) return;
    const d = document.createElement('div');
    d.id = '__fx';
    d.style.cssText = 'position:fixed;left:0;top:0;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:rgba(255,255,255,0.55);border:3px solid rgba(28,23,33,0.28);box-shadow:0 2px 10px rgba(28,23,33,0.18);opacity:0;pointer-events:none;z-index:2147483647;will-change:transform,opacity';
    document.body.appendChild(d);
  });
}
export async function touchFx(page, x, y, scale, opacity) {
  await page.evaluate(([x, y, s, o]) => { const d = document.getElementById('__fx'); d.style.transform = `translate(${x}px,${y}px) scale(${s})`; d.style.opacity = String(o); }, [x, y, scale, opacity]);
}
export async function installCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('__cur')) return;
    const d = document.createElement('div');
    d.id = '__cur';
    d.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;pointer-events:none;z-index:2147483647;opacity:0;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.35));will-change:transform';
    d.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.9 L11.6 21.6 L14.4 20.4 L11.5 13.8 L17.6 13.5 Z" fill="#1C1721" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(d);
    const r = document.createElement('div');
    r.id = '__ring';
    r.style.cssText = 'position:fixed;left:0;top:0;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:4px solid #C02EF0;opacity:0;pointer-events:none;z-index:2147483646';
    document.body.appendChild(r);
  });
}
export async function cursorAt(page, x, y, o = 1, ring = 0) {
  await page.evaluate(([x, y, o, ring]) => {
    const d = document.getElementById('__cur'); d.style.transform = `translate(${x - 4}px,${y - 2}px)`; d.style.opacity = String(o);
    const r = document.getElementById('__ring'); r.style.transform = `translate(${x}px,${y}px) scale(${0.5 + ring})`; r.style.opacity = String(ring > 0 ? 1 - ring : 0);
  }, [x, y, o, ring]);
}
export const rectOf = (page, selector, nth = 0) => page.evaluate(([s, n]) => { const el = document.querySelectorAll(s)[n]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, [selector, nth]);
