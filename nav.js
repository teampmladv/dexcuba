
/* =====================================================================
   Captura del código de recomendación (?ref=XXXXXX)
   Se guarda en el navegador y se envía al crear la cuenta. La atribución
   solo se aplica una vez, al registrarse: después no se puede cambiar.
   ===================================================================== */
(function () {
  try {
    var p = new URLSearchParams(location.search).get('ref');
    if (p && /^[A-Za-z0-9]{6}$/.test(p)) {
      localStorage.setItem('dx_ref', p.toUpperCase());
      localStorage.setItem('dx_ref_at', String(Date.now()));
    }
    // Caduca a los 60 días para no atribuir visitas antiquísimas
    var at = Number(localStorage.getItem('dx_ref_at') || 0);
    if (at && Date.now() - at > 60 * 24 * 3600 * 1000) {
      localStorage.removeItem('dx_ref');
      localStorage.removeItem('dx_ref_at');
    }
  } catch (e) {}
})();
/* =====================================================================
   DexCuba — menú de navegación móvil (compartido)
   ---------------------------------------------------------------------
   En móvil la navegación pasa a un panel desplegable desde la cabecera,
   en vez de una barra fija abajo. Motivo: los navegadores internos de las
   wallets (Trust, MetaMask, TronLink…) tienen sus propias barras
   inferiores y gestos, que tapaban o desplazaban la nuestra.

   Este script inyecta el botón ☰ y gestiona la apertura; los estilos
   viven en mobile.css. No toca nada en escritorio.
   ===================================================================== */
(function () {
  var MQ = 860;

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var nav = document.querySelector('.topnav');
    var bar = document.querySelector('.topbar');
    if (!nav || !bar) return;
    if (document.getElementById('navToggle')) return; // ya inyectado

    // Botón hamburguesa, primero en la cabecera
    var btn = document.createElement('button');
    btn.id = 'navToggle';
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Abrir menú');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '☰';
    bar.insertBefore(btn, bar.firstChild);

    // Capa oscura detrás del panel
    var back = document.createElement('div');
    back.className = 'nav-backdrop';
    back.id = 'navBackdrop';
    document.body.appendChild(back);

    function open() {
      nav.classList.add('open');
      back.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = '✕';
    }
    function close() {
      nav.classList.remove('open');
      back.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '☰';
    }
    function toggle() {
      if (nav.classList.contains('open')) close(); else open();
    }

    btn.addEventListener('click', toggle);
    back.addEventListener('click', close);

    // Al elegir una sección, el panel se cierra solo
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) close();
    });

    // Escape cierra; al volver a escritorio se limpia el estado
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > MQ) close();
    });
  });
})();

/* =====================================================================
   Botón flotante de ayuda (abajo a la derecha, con el logo)
   ---------------------------------------------------------------------
   Abre el bot de soporte en Telegram. Al pulsarlo se despliegan las
   opciones; en el móvil no estorba porque la navegación va arriba.
   Para cambiar el bot, edita BOT_TELEGRAM aquí abajo.
   ===================================================================== */
var BOT_TELEGRAM = 'DexCubaSoporteBot';   // sin la @

(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (document.getElementById('dxHelp')) return;
    // La página de pago es para gente ajena a DexCuba: no la recargamos de botones
    if (/\/pagar(\.html)?$/.test(location.pathname)) return;

    var wrap = document.createElement('div');
    wrap.id = 'dxHelp';
    wrap.className = 'dx-help';
    wrap.innerHTML =
      '<div class="dx-help-panel" id="dxHelpPanel">' +
        '<div class="dx-help-title">¿Necesitas ayuda?</div>' +
        '<a class="dx-help-item" href="https://t.me/' + BOT_TELEGRAM + '" target="_blank" rel="noopener">' +
          '<span>💬</span><span><b>Soporte en Telegram</b><br><i>Dudas, estado de tu operación</i></span></a>' +
        '<a class="dx-help-item" href="https://t.me/' + BOT_TELEGRAM + '?start=disputa" target="_blank" rel="noopener">' +
          '<span>⚖️</span><span><b>Reclamar una operación</b><br><i>Abrir una disputa</i></span></a>' +
        '<a class="dx-help-item" href="/legal.html" >' +
          '<span>📄</span><span><b>Términos y riesgos</b></span></a>' +
        '<div class="dx-help-note">Nunca te pediremos tu frase de recuperación ni tus claves.</div>' +
      '</div>' +
      '<button class="dx-help-btn" id="dxHelpBtn" aria-label="Ayuda y soporte" aria-expanded="false">' +
        '<img src="/icon.svg" alt="" width="26" height="26">' +
      '</button>';
    document.body.appendChild(wrap);

    var btn = document.getElementById('dxHelpBtn');
    var panel = document.getElementById('dxHelpPanel');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) wrap.classList.remove('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') wrap.classList.remove('open');
    });
  });
})();
