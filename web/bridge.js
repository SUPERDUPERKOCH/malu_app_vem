/* Ponte entre o HTML e o app nativo (Expo). Carrega antes do script do app. */
(function () {
  var RN = window.ReactNativeWebView;
  function post(msg) { try { RN && RN.postMessage(JSON.stringify(msg)); } catch (e) {} }

  /* --- armazenamento: cópia em memória + arquivo no celular --- */
  var dados = {};
  var seed = window.__VEM_SEED || {};
  Object.keys(seed).forEach(function (k) { dados[k] = String(seed[k]); });
  window.VEMStorage = {
    getItem: function (k) { k = String(k); return Object.prototype.hasOwnProperty.call(dados, k) ? dados[k] : null; },
    setItem: function (k, v) { k = String(k); v = String(v); dados[k] = v; post({ t: 'set', k: k, v: v }); },
    removeItem: function (k) { k = String(k); if (k in dados) { delete dados[k]; post({ t: 'del', k: k }); } },
    clear: function () { Object.keys(dados).forEach(function (k) { window.VEMStorage.removeItem(k); }); },
    key: function (i) { return Object.keys(dados)[i] || null; },
    get length() { return Object.keys(dados).length; }
  };

  /* --- respostas do app nativo --- */
  var pend = {}, seq = 0;
  function pedir(msg) {
    return new Promise(function (ok, err) {
      var id = 'r' + (++seq);
      pend[id] = { ok: ok, err: err };
      msg.id = id; post(msg);
    });
  }
  window.__vemResp = function (id, res, erro) {
    var p = pend[id]; if (!p) return; delete pend[id];
    erro ? p.err(erro) : p.ok(res);
  };

  function blobParaBase64(blob) {
    return new Promise(function (ok, err) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { err({ code: 'bad_request' }); };
      fr.readAsDataURL(blob);
    });
  }

  function mimeDe(nome, blob) {
    if (blob && blob.type) return blob.type;
    if (/\.ics$/i.test(nome)) return 'text/calendar';
    if (/\.pdf$/i.test(nome)) return 'application/pdf';
    return 'image/png';
  }
  window.VEMNative = {
    downloads: {
      save: function (o) {
        var nome = o.filename || 'vem.png';
        var dado = typeof o.data === 'string' ? new Blob([o.data], { type: mimeDe(nome) }) : o.data;
        return blobParaBase64(dado).then(function (b64) {
          return pedir({ t: 'save', filename: nome, mime: mimeDe(nome, dado), b64: b64 });
        });
      }
    },
    /* fotos dos pratos ficam em arquivos no celular (não pesam no carregamento do app) */
    fotos: {
      put: function (id, src) { return pedir({ t: 'foto-put', fid: String(id), src: String(src) }); },
      get: function (id) { return pedir({ t: 'foto-get', fid: String(id) }); },
      del: function (id) { return pedir({ t: 'foto-del', fid: String(id) }); }
    },
    /* lembretes viram notificações do celular */
    notificacoes: {
      agendar: function (lista) { post({ t: 'notif', lista: lista || [] }); }
    }
  };

  /* cor do topo da tela, pra barra de status do celular combinar */
  var ultimaCor = '';
  function corVisivel(el) {
    while (el && el !== document.documentElement) {
      if (el === document.body) break;
      var c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
      el = el.parentElement;
    }
    return getComputedStyle(document.body, '::before').backgroundColor || getComputedStyle(document.body).backgroundColor;
  }
  function checarTopo() {
    try {
      var el = document.elementFromPoint(window.innerWidth / 2, 2);
      var cor = corVisivel(el);
      if (cor && cor !== ultimaCor) { ultimaCor = cor; post({ t: 'topo', cor: cor }); }
    } catch (e) {}
  }
  setInterval(checarTopo, 350);

  /* --- vibração e área de transferência nativas --- */
  try {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: function (p) { post({ t: 'vibrate', p: p }); return true; } });
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: function (t) { return pedir({ t: 'copy', text: String(t) }); }
    } });
  } catch (e) {}

  /* --- links externos abrem no navegador / app do celular --- */
  function externo(url) { return /^(https?:|mailto:|tel:|whatsapp:)/i.test(url || ''); }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (a.hasAttribute('download') && /^blob:|^data:/.test(href)) return;
    if (externo(href)) { e.preventDefault(); post({ t: 'open', url: a.href }); }
  }, true);
  window.open = function (url) { if (url) post({ t: 'open', url: String(url) }); return null; };
})();
