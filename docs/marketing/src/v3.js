/* Webag - apresentações v3: config, flags e capturas. Compartilhado pelos dois decks. Sem dependência de rede.
   Ordem: lê config.json (ou window.__CONFIG, que o render pode injetar; ou o fallback embutido abaixo, para abrir por file://)
   -> remove do DOM o que depende de flag desligada -> preenche contato -> aponta as capturas -> marca <html data-ready="1">.
   Atributos usados no HTML:
     data-if="flag" | "!flag" | "has:campo" | "!has:campo"   o elemento só existe se a condição valer (senão é removido)
     data-cfg="nome|instagram|whatsappFmt"                   texto vindo do config
     a[data-href="ig|wa"]                                    link do Instagram / do WhatsApp (wa.me)
     img[data-qr]                                            QR do WhatsApp: src = config.qrWhatsapp
     .cap[data-cap="P10"]                                    captura: o ID vira arquivo pelo mapa CAPTURAS abaixo (único lugar a editar)
                                                             ID fora do mapa = capBase + ID + capExt; ID com valor null = sem captura: o .cap é removido
                                                             (o slide fica sem tela; ver pendencias.md V3)                                                 */
(function () {
  "use strict";
  var O = window.V3 || {};
  var BASE = O.capBase || "capturas-v3/";
  var EXT = O.capExt || ".png";
  /* Mapa ID do roteiro (§5) -> arquivo real em capturas-v3/. Um só lugar. Nenhuma imagem é duplicada: IDs diferentes podem apontar para o mesmo arquivo.
     Provisórios (captura mais próxima, o ID pedido não existe): A2, P11, P12. Sem captura (null): P1-1..P1-4, P6, P15. */
  var CAPTURAS = {
    A1: "app-loja-vitrine.jpg",
    A2: "app-produto.jpg",                 /* provisório: o roteiro pede 36 e 44 esgotados; a captura tem tamanhos M, G, P e nenhum esgotado */
    A3: "app-pedido-separando.jpg",
    A4: "app-pedido-a-caminho.jpg",        /* J8: só com a flag entregaWebag (ver C4 no HTML) */
    "P1-1": null, "P1-2": null, "P1-3": null, "P1-4": null,   /* cadastro em 4 etapas: não capturado */
    P3: "painel-cadastro-rapido-mob.jpg",
    P4: "painel-colar-lista-mob.jpg",
    P5: "painel-adicionar-varios-mob.jpg",
    P6: null,                              /* passo Fotos da lista: não capturado */
    P7: "painel-produtos-lista-mob.jpg",
    P8: "painel-precos-reajuste-previa-desk.jpg",
    P9: "painel-precos-reajuste-desfazer-desk.jpg",
    P10: "painel-pedido-novo-mob.jpg",
    P11: null,                             /* pedido em separação: não capturado (o detalhe do pedido traz dados do cliente) */
    P12: "painel-pronto-coleta-mob.jpg",   /* provisório: lista "Prontos"; a caixa com volumes não foi capturada */
    P13: "painel-financeiro-desk.jpg",
    P14: "painel-extrato-desk.jpg",
    P15: null
  };
  if (O.capMap) Object.keys(O.capMap).forEach(function (k) { CAPTURAS[k] = O.capMap[k]; });
  var DEF = {
    nome: "Yago",
    whatsapp: "",
    instagram: "@webag",
    site: "",
    email: "",
    qrWhatsapp: "",
    flags: { semMensalidade: false, trocaNoPainel: false, prazoAceite: false, entregaWebag: false, contaDeExemplo: false }
  };

  function withDefaults(c) {
    c = c || {};
    var out = {};
    Object.keys(DEF).forEach(function (k) {
      if (k !== "flags") out[k] = c[k] !== undefined && c[k] !== null ? c[k] : DEF[k];
    });
    out.flags = {};
    Object.keys(DEF.flags).forEach(function (k) {
      out.flags[k] = !!(c.flags && c.flags[k] !== undefined ? c.flags[k] : DEF.flags[k]);
    });
    return out;
  }

  function loadConfig() {
    if (window.__CONFIG) return Promise.resolve(window.__CONFIG);
    if (typeof fetch !== "function") return Promise.resolve(null);
    return fetch("config.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function fmtPhone(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length > 11 && d.indexOf("55") === 0) d = d.slice(2);
    if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
    if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
    return String(raw || "").trim();
  }

  function digits55(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    return d.indexOf("55") === 0 && d.length > 11 ? d : "55" + d;
  }

  function cond(expr, cfg) {
    var neg = expr.charAt(0) === "!";
    if (neg) expr = expr.slice(1);
    var v;
    if (expr.indexOf("has:") === 0) {
      var x = cfg[expr.slice(4)];
      v = !!(x && String(x).trim());
    } else {
      v = !!cfg.flags[expr];
    }
    return neg ? !v : v;
  }

  function all(sel) { return [].slice.call(document.querySelectorAll(sel)); }

  function apply(cfg) {
    var handle = String(cfg.instagram || "").trim();
    if (handle && handle.charAt(0) !== "@") handle = "@" + handle;
    var vals = { nome: cfg.nome || "", instagram: handle, whatsappFmt: cfg.whatsapp ? fmtPhone(cfg.whatsapp) : "" };

    all("[data-if]").forEach(function (el) {
      if (!cond(el.getAttribute("data-if"), cfg) && el.parentNode) el.parentNode.removeChild(el);
    });
    all("[data-cfg]").forEach(function (el) { el.textContent = vals[el.getAttribute("data-cfg")] || ""; });
    all("a[data-href]").forEach(function (a) {
      var k = a.getAttribute("data-href");
      if (k === "ig" && handle) a.setAttribute("href", "https://instagram.com/" + handle.slice(1));
      if (k === "wa" && cfg.whatsapp) a.setAttribute("href", "https://wa.me/" + digits55(cfg.whatsapp));
    });
    all("img[data-qr]").forEach(function (img) { if (cfg.qrWhatsapp) img.setAttribute("src", cfg.qrWhatsapp); });
    all(".cap[data-cap]").forEach(function (cap) {
      var id = cap.getAttribute("data-cap");
      var file = Object.prototype.hasOwnProperty.call(CAPTURAS, id) ? CAPTURAS[id] : id + EXT;
      if (file === null) { if (cap.parentNode) cap.parentNode.removeChild(cap); return; }
      var img = cap.querySelector("img");
      if (!img) return;
      img.addEventListener("error", function () { cap.classList.add("miss"); });
      img.setAttribute("src", BASE + file);
    });
    var meta = document.querySelector('meta[name="marketing-slides"]');
    if (meta) meta.setAttribute("content", String(document.querySelectorAll("section.slide").length));

    // Na tela (não no PDF): reduz o zoom se a janela é menor que 1920 px. No render a janela tem 1920 e nada muda.
    if (!/[?&]render/.test(location.search) && window.innerWidth < 1920) {
      document.documentElement.style.setProperty("--fit", (window.innerWidth / 1960).toFixed(3));
    }
  }

  loadConfig()
    .then(function (c) {
      try { apply(withDefaults(c)); } catch (e) { console.error("v3.js: " + e.message); }
      return document.fonts && document.fonts.ready ? document.fonts.ready : null;
    })
    .catch(function () {})
    .then(function () { document.documentElement.setAttribute("data-ready", "1"); });
})();
