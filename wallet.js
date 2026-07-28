/* =====================================================================
   DexCuba — Conector universal de wallets TRON
   ---------------------------------------------------------------------
   Soporta cualquier wallet que inyecte window.tronWeb:
     · TronLink (extensión y app móvil)
     · TokenPocket
     · Bitget Wallet (antes BitKeep)
     · OKX Wallet
     · Trust Wallet (navegador integrado)
     · imToken, Math Wallet y similares

   Uso:
     const w = await DexWallet.connect();   // muestra selector si hace falta
     w.tronWeb   -> instancia de TronWeb
     w.address   -> dirección base58
     w.name      -> nombre de la wallet detectada

   DexWallet.onAccountChange(cb) para reaccionar a cambios de cuenta.
   ===================================================================== */
(function () {
  'use strict';

  var WALLETS = [
    {
      id: 'tronlink',
      name: 'TronLink',
      icon: '🔗',
      desc: 'La wallet oficial de TRON',
      detect: function () { return !!(window.tronLink || (window.tronWeb && window.tronWeb.isTronLink)); },
      install: 'https://www.tronlink.org/',
      mobile: 'tronlinkoutside://pull.activity?param=' // esquema de deep link
    },
    {
      id: 'tokenpocket',
      name: 'TokenPocket',
      icon: '🅣',
      desc: 'Multichain, muy usada en móvil',
      detect: function () { return !!(window.tokenpocket || (window.tronWeb && window.tronWeb.isTokenPocket)); },
      install: 'https://www.tokenpocket.pro/'
    },
    {
      id: 'bitget',
      name: 'Bitget Wallet',
      icon: '🅑',
      desc: 'Antes BitKeep',
      detect: function () { return !!(window.bitkeep && window.bitkeep.tronLink); },
      install: 'https://web3.bitget.com/'
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      icon: '⬛',
      desc: 'Wallet del exchange OKX',
      detect: function () { return !!(window.okxwallet && window.okxwallet.tronLink); },
      install: 'https://www.okx.com/web3'
    },
    {
      id: 'generic',
      name: 'Otra wallet TRON',
      icon: '👛',
      desc: 'Cualquier wallet compatible detectada',
      detect: function () { return !!window.tronWeb && !window.tronLink; },
      install: null
    }
  ];

  var listeners = [];

  function detected() {
    return WALLETS.filter(function (w) {
      try { return w.detect(); } catch (e) { return false; }
    });
  }

  function isMobile() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  /* Espera a que la wallet inyecte tronWeb (a veces tarda al cargar). */
  function waitForInjection(ms) {
    ms = ms || 2500;
    return new Promise(function (resolve) {
      if (window.tronWeb) return resolve(true);
      var t = 0;
      var iv = setInterval(function () {
        t += 120;
        if (window.tronWeb || t >= ms) { clearInterval(iv); resolve(!!window.tronWeb); }
      }, 120);
    });
  }

  /* Pide autorización a la wallet activa. */
  async function requestAccounts() {
    var provider = window.tronLink ||
                   (window.bitkeep && window.bitkeep.tronLink) ||
                   (window.okxwallet && window.okxwallet.tronLink) ||
                   null;
    if (provider && provider.request) {
      try { await provider.request({ method: 'tron_requestAccounts' }); } catch (e) {}
    }
    var tw = (provider && provider.tronWeb) || window.tronWeb;
    if (!tw || !tw.defaultAddress || !tw.defaultAddress.base58) {
      // Reintento breve: algunas wallets rellenan la dirección con retraso
      for (var i = 0; i < 12; i++) {
        await new Promise(function (r) { setTimeout(r, 250); });
        tw = (provider && provider.tronWeb) || window.tronWeb;
        if (tw && tw.defaultAddress && tw.defaultAddress.base58) break;
      }
    }
    return tw;
  }

  /* ---------- Selector visual ---------- */
  function chooser(options) {
    return new Promise(function (resolve) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(4,8,13,.78);display:grid;' +
        'place-items:center;z-index:10000;padding:20px;font-family:"IBM Plex Sans",system-ui,sans-serif';

      var items = options.map(function (w) {
        var has = w.available;
        return '<button data-id="' + w.id + '" ' + (has ? '' : 'data-install="' + (w.install || '') + '"') + ' style="' +
          'display:flex;align-items:center;gap:13px;width:100%;padding:14px;border-radius:11px;' +
          'border:1px solid #243247;background:#16202F;color:#EAF0F6;cursor:pointer;margin-bottom:9px;' +
          'font-family:inherit;text-align:left;transition:border-color .12s">' +
            '<span style="width:38px;height:38px;border-radius:10px;background:#101826;display:grid;' +
              'place-items:center;font-size:18px;flex:none">' + w.icon + '</span>' +
            '<span style="flex:1;min-width:0">' +
              '<b style="display:block;font-size:14.5px;font-weight:600">' + w.name + '</b>' +
              '<span style="font-size:12px;color:#8A99AD">' + (has ? w.desc : 'No detectada · instalar') + '</span>' +
            '</span>' +
            (has ? '<span style="width:8px;height:8px;border-radius:50%;background:#2EBD85;flex:none"></span>' : '') +
          '</button>';
      }).join('');

      ov.innerHTML =
        '<div style="background:#101826;border:1px solid #243247;border-radius:16px;padding:24px;width:min(400px,100%)">' +
          '<h3 style="font-family:\'Space Grotesk\',system-ui,sans-serif;font-size:18px;margin:0 0 4px;color:#EAF0F6">Conecta tu wallet</h3>' +
          '<p style="color:#8A99AD;font-size:13px;margin:0 0 18px">Elige la wallet que uses para operar en la red TRON.</p>' +
          items +
          '<button id="dxwCancel" style="width:100%;padding:11px;margin-top:6px;border-radius:10px;border:none;' +
            'background:transparent;color:#8A99AD;cursor:pointer;font-family:inherit;font-size:13px">Cancelar</button>' +
        '</div>';

      document.body.appendChild(ov);

      ov.addEventListener('click', function (e) {
        if (e.target === ov) { ov.remove(); resolve(null); return; }
        var btn = e.target.closest('button');
        if (!btn) return;
        if (btn.id === 'dxwCancel') { ov.remove(); resolve(null); return; }
        var install = btn.getAttribute('data-install');
        if (install) { window.open(install, '_blank'); return; }
        ov.remove();
        resolve(btn.getAttribute('data-id'));
      });
    });
  }

  /* ---------- API pública ---------- */
  var DexWallet = {
    /* Lista de wallets con su disponibilidad actual. */
    available: function () {
      var found = detected();
      var ids = found.map(function (w) { return w.id; });
      return WALLETS.filter(function (w) { return w.id !== 'generic' || ids.indexOf('generic') !== -1; })
        .map(function (w) {
          return { id: w.id, name: w.name, icon: w.icon, desc: w.desc, install: w.install,
                   available: ids.indexOf(w.id) !== -1 };
        });
    },

    /* Conecta. Si hay varias wallets o ninguna, muestra el selector. */
    connect: async function (opts) {
      opts = opts || {};
      await waitForInjection(opts.wait || 2000);
      var found = detected();

      if (found.length === 0) {
        if (opts.silent) return null;
        await chooser(DexWallet.available());
        return null;
      }

      // Con varias detectadas dejamos elegir; con una sola vamos directos.
      if (found.length > 1 && !opts.silent) {
        var pick = await chooser(DexWallet.available());
        if (!pick) return null;
      }

      var tw = await requestAccounts();
      if (!tw || !tw.defaultAddress || !tw.defaultAddress.base58) return null;

      var name = (found[0] && found[0].name) || 'Wallet TRON';
      DexWallet.current = { tronWeb: tw, address: tw.defaultAddress.base58, name: name };
      return DexWallet.current;
    },

    /* Reconexión silenciosa: sin ventanas ni selector. */
    disconnect: function () {
      try { sessionStorage.setItem('dx_no_reconnect', '1'); } catch (e) {}
    },
    reconnect: async function () {
      try { if (sessionStorage.getItem('dx_no_reconnect')) return null; } catch (e) {}
      await waitForInjection(1200);
      var tw = window.tronWeb;
      if (tw && tw.defaultAddress && tw.defaultAddress.base58) {
        var found = detected();
        DexWallet.current = {
          tronWeb: tw,
          address: tw.defaultAddress.base58,
          name: (found[0] && found[0].name) || 'Wallet TRON'
        };
        return DexWallet.current;
      }
      return null;
    },

    onAccountChange: function (cb) {
      listeners.push(cb);
    },

    current: null,
    isMobile: isMobile
  };

  /* Cambios de cuenta / red */
  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.message) return;
    var a = e.data.message.action;
    if (a === 'accountsChanged' || a === 'setAccount' || a === 'setNode') {
      listeners.forEach(function (cb) { try { cb(e.data.message.data); } catch (err) {} });
    }
  });

  window.DexWallet = DexWallet;
})();
