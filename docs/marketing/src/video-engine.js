/* Webag: motor determinístico dos vídeos Stories (video-lojista.html, video-cliente.html). Autor: product-designer. 2026-11-22.
   Contrato com o render (scripts/marketing-render.mjs): window.__duration, window.__fps e window.setTime(t).
   window.setTime(t) posiciona TUDO no instante t (qualquer ordem, sem estado) e DEVOLVE UMA PROMISE que resolve quando os <video>
   ativos (se houver clipes) terminaram o 'seeked' mais 2 quadros de pintura. Sem CSS animation/transition, sem Date.now, sem Math.random.
   window.__ready (Promise) resolve com fontes e (se houver) metadados dos clipes.

   Uso: WBVideo({ duration, fps, cuts, tracks: function (h) {...}, clips: [...] }).
   - cuts: instantes dos cortes (s), N+1 valores para N cenas; as cenas são <section id="s1">..<section id="sN">.
   - tracks(h): declara as trilhas. h.tr(id, prop, t, d, de, para, curva) com prop em x|y|sx|sy|o; h.snap, h.rise, h.bump, h.pop são atalhos.
     Elemento animado = só translate/scale/opacity (o motor escreve style.transform e style.opacity; nunca ponha transform em CSS no mesmo elemento:
     use um invólucro). Elemento sem trilha 'o' fica com opacidade 1.
   - clips (opcional, vazio por padrão: nenhum pedido de rede): [{ slot: 'id-do-div', scene: 4, base: 'clips/painel', inn: 0 }] cria um <video> mudo dentro de
     #slot (que deve ter a classe .vslot) mostrando o trecho do clipe a partir de `inn` s no início da cena. Procura base.mp4 e base.webm. Só ligue quando o arquivo existir
     (um 404 faz o render falhar de propósito). */
(function () {
  'use strict';

  window.WBVideo = function (cfg) {
    var DURATION = cfg.duration, FPS = cfg.fps || 30, CUT = cfg.cuts, NS = CUT.length - 1;

    var EASE = {
      lin:  function (x) { return x; },
      out3: function (x) { var u = 1 - x; return 1 - u * u * u; },
      out5: function (x) { var u = 1 - x; return 1 - u * u * u * u * u; },
      back: function (x) { var c = 1.2, u = x - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
    };
    var $ = function (id) {
      var e = document.getElementById(id);
      if (!e) throw new Error('WBVideo: elemento #' + id + ' não existe');
      return e;
    };
    var n = function (v) { return Math.round(v * 1000) / 1000; };

    // ---------- trilhas ----------
    var TR = {};
    function tr(id, prop, t, d, from, to, ease) {
      if (!TR[id]) TR[id] = {};
      if (!TR[id][prop]) TR[id][prop] = [];
      TR[id][prop].push({ t: t, d: d, from: from, to: to, e: EASE[ease || 'out3'] });
    }
    // Regra de corte: no quadro do corte NADA começa invisível. O título principal da cena já está opaco no 1º quadro e só se
    // desloca poucos px (snap). Fade/pop só em elementos que entram DEPOIS do corte.
    function snap(id, t, dy, d) { tr(id, 'y', t, d || 0.10, dy, 0, 'out3'); }
    function rise(id, t, dy, d) { tr(id, 'o', t, d * 0.6, 0, 1, 'lin'); tr(id, 'y', t, d, dy, 0, 'out3'); }
    function bump(id, t, d, s0) { tr(id, 'sx', t, d, s0, 1, 'back'); tr(id, 'sy', t, d, s0, 1, 'back'); }
    function pop(id, t, d, s0) { tr(id, 'o', t, d * 0.5, 0, 1, 'lin'); bump(id, t, d, s0); }
    cfg.tracks({ tr: tr, snap: snap, rise: rise, bump: bump, pop: pop, cut: CUT });

    // ---------- cenas: visíveis só em [t0, t1) ----------
    var SC = [], ANIM = [], i, id, prop;
    for (i = 0; i < NS; i++) SC.push({ el: $('s' + (i + 1)), t0: CUT[i], t1: CUT[i + 1] + (i === NS - 1 ? 1 : 0) });
    for (id in TR) {
      for (prop in TR[id]) TR[id][prop].sort(function (a, b) { return a.t - b.t; });
      ANIM.push({ el: $(id), p: TR[id] });
    }

    // valor de uma propriedade em t (puro): antes do 1º segmento vale o 'de' dele; depois de cada segmento, o 'para'
    function val(segs, t, def) {
      if (!segs) return def;
      var v = segs[0].from, q, s;
      for (q = 0; q < segs.length; q++) {
        s = segs[q];
        if (t < s.t) break;
        if (t >= s.t + s.d) { v = s.to; continue; }
        v = s.from + (s.to - s.from) * s.e((t - s.t) / s.d);
        break;
      }
      return v;
    }

    // ---------- clipes opcionais ----------
    var VID = [];
    (cfg.clips || []).forEach(function (spec) {
      var v = document.createElement('video'), s1 = document.createElement('source'), s2 = document.createElement('source');
      v.muted = true; v.defaultMuted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.playsInline = true;
      v.preload = 'auto'; v.controls = false; v.setAttribute('aria-hidden', 'true');
      s1.src = spec.base + '.mp4';  s1.type = 'video/mp4';
      s2.src = spec.base + '.webm'; s2.type = 'video/webm';   // reserva: Chromium sem H.264 usa o WebM
      v.appendChild(s1); v.appendChild(s2);
      $(spec.slot).appendChild(v);
      VID.push({ el: v, spec: spec, t0: CUT[spec.scene - 1], t1: CUT[spec.scene], last: s2 });
    });

    function afterPaint() {
      return new Promise(function (res) {
        var done = false;
        function f() { if (!done) { done = true; res(); } }
        requestAnimationFrame(function () { requestAnimationFrame(f); });
        setTimeout(f, 120);   // só um teto de espera; o valor dos quadros não depende dele
      });
    }
    function seek(vo, t) {
      return new Promise(function (res) {
        var v = vo.el, target = (vo.spec.inn || 0) + (t - vo.t0), d = v.duration;
        if (v.readyState < 1) { res(); return; }
        if (isFinite(d)) target = Math.min(target, Math.max(0, d - 0.034));   // clipe curto: segura o último quadro
        if (target < 0) target = 0;
        if (Math.abs(v.currentTime - target) < 0.0005 && !v.seeking) { afterPaint().then(res); return; }
        var done = false, tm;
        function fin() { if (done) return; done = true; clearTimeout(tm); v.removeEventListener('seeked', fin); afterPaint().then(res); }
        v.addEventListener('seeked', fin);
        tm = setTimeout(fin, 3000);   // teto contra 'seeked' que não vem
        v.currentTime = target;
      });
    }

    // ---------- setTime ----------
    function setTime(t) {
      t = Number(t);
      if (!isFinite(t)) t = 0;
      if (t < 0) t = 0;
      if (t > DURATION) t = DURATION;
      var q, a, p, ts = t + 1e-6, waits = [];
      for (q = 0; q < SC.length; q++) {
        SC[q].el.style.visibility = (ts >= SC[q].t0 && ts < SC[q].t1) ? 'visible' : 'hidden';
      }
      for (q = 0; q < ANIM.length; q++) {
        a = ANIM[q]; p = a.p;
        a.el.style.transform =
          'translate(' + n(val(p.x, t, 0)) + 'px,' + n(val(p.y, t, 0)) + 'px) ' +
          'scale(' + n(val(p.sx, t, 1)) + ',' + n(val(p.sy, t, 1)) + ')';
        a.el.style.opacity = n(val(p.o, t, 1));
      }
      for (q = 0; q < VID.length; q++) {
        if (ts >= VID[q].t0 && ts < VID[q].t1) waits.push(seek(VID[q], t));
      }
      return Promise.all(waits).then(function () { return true; });
    }

    window.__duration = DURATION;
    window.__fps = FPS;
    window.setTime = setTime;
    window.__clipInfo = function () {
      return VID.map(function (vo) { return { cena: vo.spec.scene, slot: vo.spec.slot, inn: vo.spec.inn || 0, readyState: vo.el.readyState, duracao: vo.el.duration, src: vo.el.currentSrc }; });
    };
    setTime(0);

    function loaded(vo) {
      return new Promise(function (res) {
        var v = vo.el, done = false;
        function fin() { if (!done) { done = true; res(); } }
        if (v.readyState >= 2) { fin(); return; }
        v.addEventListener('loadeddata', fin);
        v.addEventListener('error', fin);
        vo.last.addEventListener('error', fin);
        setTimeout(fin, 5000);
      });
    }
    var fontsP = (document.fonts && document.fonts.load) ? Promise.all([
      document.fonts.load('800 100px "Bricolage Grotesque"'),
      document.fonts.load('600 32px "Figtree"'),
      document.fonts.load('700 32px "Figtree"'),
      document.fonts.load('800 32px "Figtree"')
    ]) : Promise.resolve(null);
    window.__ready = Promise.all([fontsP].concat(VID.map(loaded))).then(function () { return setTime(0); });

    // régua de pré-visualização manual (?preview): arrasta o tempo; setas = 1 quadro
    if (/[?&]preview/.test(location.search)) {
      var stage = $('stage'), bar = document.createElement('div'), r = document.createElement('input'), lab = document.createElement('span');
      var fit = function () { stage.style.transform = 'scale(' + n((window.innerHeight - 48) / 1920) + ')'; };
      bar.id = 'prev'; r.type = 'range'; r.min = 0; r.max = DURATION; r.step = 1 / FPS; r.value = 0;
      r.addEventListener('input', function () { setTime(r.value); lab.textContent = Number(r.value).toFixed(2) + ' s'; });
      document.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        r.value = Math.min(DURATION, Math.max(0, Number(r.value) + d / FPS));
        r.dispatchEvent(new Event('input'));
      });
      lab.textContent = '0.00 s'; bar.appendChild(r); bar.appendChild(lab); document.body.appendChild(bar);
      window.addEventListener('resize', fit); fit();
    }
  };
})();
