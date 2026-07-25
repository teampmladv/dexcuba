/* DexCuba — aviso de almacenamiento técnico.
   Se inyecta solo si el usuario no lo ha aceptado antes. No hay cookies de
   seguimiento ni de publicidad: solo se informa del almacenamiento necesario. */
(function () {
  'use strict';
  var KEY = 'dx_cookies';
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }

  function build() {
    var bar = document.createElement('div');
    bar.id = 'dxCookieBar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Aviso de almacenamiento');
    bar.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#101826;' +
      'border-top:1px solid #243247;padding:14px 20px;box-shadow:0 -8px 28px rgba(0,0,0,.35);' +
      'font-family:"IBM Plex Sans",system-ui,sans-serif';

    bar.innerHTML =
      '<div style="max-width:900px;margin:0 auto;display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
        '<p style="flex:1;min-width:240px;margin:0;font-size:12.5px;color:#8A99AD;line-height:1.6">' +
          'Usamos solo almacenamiento técnico necesario para mantener tu sesión. ' +
          'Sin cookies de publicidad ni de seguimiento. ' +
          '<a href="/legal.html#cookies" style="color:#1FC7B6;text-decoration:none">Más información</a>' +
        '</p>' +
        '<button id="dxCookieOk" style="padding:9px 20px;border-radius:9px;border:none;cursor:pointer;' +
          'font-family:inherit;font-size:13.5px;font-weight:600;background:linear-gradient(135deg,#1FC7B6,#0E9C8D);' +
          'color:#05201C">Entendido</button>' +
      '</div>';

    document.body.appendChild(bar);
    document.getElementById('dxCookieOk').addEventListener('click', function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
