/* Webag: contato nas peças sociais (v2.3). Autor: product-designer. 2026-11-22.
   Preenche todo elemento [data-handle] com o Instagram de src/config.json (campo "instagram"); sem config, vale o texto que já está no HTML ("@webag", provisório, IF1).
   [data-fit="N"]: se a largura do elemento passar de N px (handle comprido), reduz a fonte de 4 em 4 px até caber (piso 40 px). Mede com offsetWidth (não sofre transform do vídeo).
   Sem Date.now/Math.random; nenhum efeito além do texto. O render serve docs/ por http, então o fetch funciona; com window.__CONFIG injetado, usa ele. */
(function () {
  'use strict';
  var base = new URL('config.json', document.currentScript.src).href;

  function apply(c) {
    var h = String((c && c.instagram) || '').trim();
    var els = document.querySelectorAll('[data-handle]'), i, el, max, fs, guard;
    for (i = 0; i < els.length; i++) {
      el = els[i];
      if (h) el.textContent = h;
      max = parseFloat(el.getAttribute('data-fit'));
      if (max > 0) {
        fs = parseFloat(getComputedStyle(el).fontSize);
        guard = 0;
        while (el.offsetWidth > max && fs > 40 && guard++ < 60) { fs -= 4; el.style.fontSize = fs + 'px'; }
      }
    }
  }

  var src = window.__CONFIG ? Promise.resolve(window.__CONFIG) : fetch(base).then(function (r) { return r.json(); });
  window.__cfgReady = src.catch(function () { return null; }).then(function (c) {
    // espera as fontes para medir a largura com a fonte final
    var f = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return f.then(function () { apply(c); });
  });
})();
