/* DexCuba — instalación como app (PWA).
   Registra el service worker y muestra un aviso discreto para instalar.
   En iOS no existe el evento de instalación, así que se explica el gesto. */
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  var KEY = 'dx_pwa_dismissed';
  var deferred = null;

  function dismissed() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return true; }
  }
  function dismiss() {
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    var b = document.getElementById('dxPwaBar');
    if (b) b.remove();
  }
  function standalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function bar(html, withButton) {
    if (document.getElementById('dxPwaBar')) return;
    var el = document.createElement('div');
    el.id = 'dxPwaBar';
    el.style.cssText =
      'position:fixed;left:12px;right:12px;bottom:12px;z-index:9998;background:#101826;' +
      'border:1px solid #1FC7B6;border-radius:14px;padding:14px 16px;' +
      'box-shadow:0 10px 34px rgba(0,0,0,.45);font-family:"IBM Plex Sans",system-ui,sans-serif;' +
      'max-width:520px;margin:0 auto';
    el.innerHTML =
      '<div style="display:flex;align-items:center;gap:13px">' +
        '<img src="/icon-192.png" alt="" style="width:42px;height:42px;border-radius:11px;flex:none">' +
        '<div style="flex:1;min-width:0">' +
          '<b style="display:block;font-size:14px;color:#EAF0F6;font-weight:600">Instala DexCuba</b>' +
          '<span style="font-size:12px;color:#8A99AD;line-height:1.5;display:block">' + html + '</span>' +
        '</div>' +
        (withButton
          ? '<button id="dxPwaGo" style="padding:9px 16px;border-radius:9px;border:none;cursor:pointer;' +
            'font-family:inherit;font-size:13px;font-weight:600;background:linear-gradient(135deg,#1FC7B6,#0E9C8D);' +
            'color:#05201C;flex:none">Instalar</button>'
          : '') +
        '<button id="dxPwaNo" aria-label="Cerrar" style="background:none;border:none;color:#8A99AD;' +
          'cursor:pointer;font-size:18px;padding:4px;flex:none">×</button>' +
      '</div>';
    document.body.appendChild(el);

    var no = document.getElementById('dxPwaNo');
    if (no) no.addEventListener('click', dismiss);

    var go = document.getElementById('dxPwaGo');
    if (go) go.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () { deferred = null; dismiss(); });
    });
  }

  // Android / escritorio: el navegador avisa cuando se puede instalar.
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    if (dismissed() || standalone()) return;
    setTimeout(function () {
      bar('Añádela a tu pantalla de inicio: abre más rápido y funciona sin conexión.', true);
    }, 2500);
  });

  // iOS: no hay evento; se indica el gesto manual.
  if (isIOS() && !standalone() && !dismissed()) {
    setTimeout(function () {
      bar('Pulsa <b style="color:#EAF0F6">Compartir</b> y luego <b style="color:#EAF0F6">Añadir a pantalla de inicio</b>.', false);
    }, 3500);
  }
})();
