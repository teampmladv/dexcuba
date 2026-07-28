// DexCuba — bot de soporte en Telegram (webhook sobre Cloudflare)
// ---------------------------------------------------------------------------
// Endpoint del webhook:  POST /api/telegram
//
// Qué hace:
//   · Responde de forma exhaustiva a las preguntas informativas (functions/lib/kb.js)
//   · Consulta el estado REAL de un trade en la cadena (TRON y BNB Chain)
//   · Muestra la tasa cripto del día
//   · Escala a un humano: abre tickets, los guarda en KV y avisa al administrador
//
// Secretos necesarios (Cloudflare → Settings → Environment variables):
//   TELEGRAM_BOT_TOKEN       token que da @BotFather
//   TELEGRAM_ADMIN_CHAT      tu chat id (te lo dice /whoami en el propio bot)
//   TELEGRAM_WEBHOOK_SECRET  cadena inventada; Telegram la reenvía en cada aviso
//
// Nota de seguridad: el bot NUNCA pide claves privadas ni frases de recuperación,
// y lo dice explícitamente cuando alguien pregunta por seguridad.

import { TEMAS, MENU, CONTACTO_HUMANO } from '../lib/kb.js';

const ESCROW_TRON = 'TUcZmJv5e9bnRJ7TGsY8LCK2QVMtiEDsva';
const ESCROW_BSC = '0xFb3005e639173Fbf95c1A3076E748ab48B9d7b59';
const SEL_TRADES = '1e6c598e'; // trades(uint256)
const ESTADOS = ['—', 'Fondos bloqueados', 'CUP pagado (pendiente de liberar)', 'Liberado', 'Reembolsado'];

/* ========================= Webhook ========================= */

export async function onRequestPost(context) {
  const env = context.env;
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response('bot no configurado', { status: 503 });

  // Telegram reenvía el secreto en esta cabecera: descarta peticiones ajenas
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const got = context.request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('no autorizado', { status: 401 });
  }

  let update;
  try { update = await context.request.json(); } catch { return ok(); }

  try {
    if (update.callback_query) await onCallback(context, update.callback_query);
    else if (update.message) await onMessage(context, update.message);
  } catch (e) {
    // Nunca devolvemos error a Telegram: reintentaría en bucle
    console.log('error del bot:', e && e.message);
  }
  return ok();
}

const ok = () => new Response('ok');

/* ========================= Mensajes ========================= */

async function onMessage(context, msg) {
  const chat = msg.chat.id;
  const text = (msg.text || '').trim();
  const kv = context.env.OFFERS;

  // ¿Hay una conversación guiada en marcha? (apertura de ticket o disputa)
  const state = kv ? await kv.get(`tgstate:${chat}`, 'json') : null;
  if (state && !text.startsWith('/')) return continuarFlujo(context, chat, text, state, msg);

  const [cmd, ...args] = text.split(/\s+/);

  switch ((cmd || '').toLowerCase()) {
    case '/start':
    case '/ayuda':
    case '/help':
    case '/menu':
      return enviarMenu(context, chat);

    case '/trade':
      return consultarTrade(context, chat, args);

    case '/tasa':
      return mostrarTasa(context, chat);

    case '/soporte':
      return iniciarTicket(context, chat, 'consulta');

    case '/disputa':
      return iniciarTicket(context, chat, 'disputa');

    case '/cancelar':
      if (kv) await kv.delete(`tgstate:${chat}`);
      return send(context, chat, 'Listo, cancelado. Escribe /ayuda cuando quieras.');

    case '/whoami':
      return send(context, chat, `Tu chat id es <code>${chat}</code>`);

    default:
      return responderTexto(context, chat, text);
  }
}

/* Sin comando: intentamos entender la pregunta y, si no, ofrecemos el menú */
async function responderTexto(context, chat, text) {
  const t = text.toLowerCase();

  const pistas = [
    [['frase', 'semilla', 'clave privada', '12 palabras', 'private key'], 'seguridad'],
    [['estafa', 'robo', 'robaron', 'phishing', 'estafaron'], 'seguridad'],
    [['disputa', 'no me llegó', 'no me llego', 'no pagó', 'no pago', 'estafó', 'reclamo'], 'disputa_info'],
    [['escrow', 'bloquear', 'liberar', 'reembolso'], 'escrow'],
    [['id', 'número de trade', 'numero de trade'], 'escrow_ids'],
    [['cobrar', 'cobro', 'enlace de pago', 'link de pago'], 'cobros'],
    [['mostrador', 'pos', 'caja', 'negocio'], 'mostrador'],
    [['convertir', 'convertidor', 'cambiar', 'swap'], 'convertidor'],
    [['vip', 'business', 'plan', 'suscripción', 'suscripcion'], 'planes'],
    [['comisión', 'comision', 'cuánto cobran', 'cuanto cobran', 'fee'], 'comisiones'],
    [['trc', 'bep', 'red', 'network', 'bnb', 'tron'], 'redes'],
    [['tasa', 'precio', 'cambio', 'cup'], 'tasa_info'],
    [['empezar', 'empiezo', 'primeros pasos', 'wallet', 'billetera'], 'primeros_pasos'],
    [['error', 'no funciona', 'problema', 'falla'], 'problemas'],
    [['referid', 'invitar', 'invita', 'recomend', 'afiliad', 'comisión por traer'], 'referidos'],
    [['privacidad', 'kyc', 'datos', 'legal'], 'legal'],
  ];

  for (const [claves, tema] of pistas) {
    if (claves.some(k => t.includes(k))) return enviarTema(context, chat, tema);
  }

  return send(context, chat,
    'No estoy seguro de haber entendido. Elige un tema del menú o escribe /soporte para hablar con una persona.',
    tecladoMenu());
}

/* ========================= Menú y temas ========================= */

function tecladoMenu() {
  return {
    inline_keyboard: MENU.map(fila =>
      fila.map(id => ({ text: TEMAS[id].titulo, callback_data: 't:' + id }))
    ).concat([[
      { text: '🆘 Hablar con soporte', callback_data: 'x:soporte' },
      { text: '⚖️ Abrir disputa', callback_data: 'x:disputa' },
    ]]),
  };
}

async function enviarMenu(context, chat) {
  const txt =
`👋 <b>Soporte de DexCuba</b>

Elige un tema o escríbeme tu pregunta con tus palabras.

<b>Comandos útiles:</b>
<code>/trade 5</code> — estado de un trade en TRON
<code>/trade 5 bsc</code> — estado en BNB Chain
<code>/tasa</code> — tasa cripto de hoy
<code>/soporte</code> — abrir un ticket con una persona
<code>/disputa</code> — reclamar una operación

⚠️ <b>Nunca</b> te pediré tu frase de recuperación ni tus claves. Quien te las pida quiere robarte.`;
  return send(context, chat, txt, tecladoMenu());
}

async function enviarTema(context, chat, id) {
  const tema = TEMAS[id];
  if (!tema) return enviarMenu(context, chat);
  return send(context, chat, `<b>${tema.titulo}</b>\n\n${tema.texto}\n\n${CONTACTO_HUMANO}`, {
    inline_keyboard: [[
      { text: '◀️ Volver al menú', callback_data: 'x:menu' },
      { text: '🆘 Soporte', callback_data: 'x:soporte' },
    ]],
  });
}

async function onCallback(context, cq) {
  const chat = cq.message.chat.id;
  const data = cq.data || '';
  await answerCallback(context, cq.id);

  if (data.startsWith('t:')) return enviarTema(context, chat, data.slice(2));
  if (data === 'x:menu') return enviarMenu(context, chat);
  if (data === 'x:soporte') return iniciarTicket(context, chat, 'consulta');
  if (data === 'x:disputa') return iniciarTicket(context, chat, 'disputa');
  return enviarMenu(context, chat);
}

/* ========================= Consulta on-chain ========================= */

async function consultarTrade(context, chat, args) {
  const id = (args[0] || '').replace(/\D/g, '');
  if (!id) {
    return send(context, chat,
      'Dime el número: <code>/trade 5</code> para TRON o <code>/trade 5 bsc</code> para BNB Chain.');
  }
  const red = (args[1] || '').toLowerCase();
  const esBsc = red.includes('bsc') || red.includes('bnb') || red.includes('bep');

  await send(context, chat, '🔎 Consultando la cadena…');

  const t = esBsc ? await tradeBsc(context, id) : await tradeTron(context, id);
  if (!t.ok) {
    return send(context, chat,
      `No pude leer el trade ${id} en ${esBsc ? 'BNB Chain' : 'TRON'}: ${t.error}\n\n` +
      'Comprueba el número y la red. ' + CONTACTO_HUMANO);
  }
  if (!t.existe) {
    return send(context, chat, `No existe el trade <b>${id}</b> en ${esBsc ? 'BNB Chain' : 'TRON'}.`);
  }

  const exp = esBsc
    ? `https://bscscan.com/address/${ESCROW_BSC}`
    : `https://tronscan.org/#/contract/${ESCROW_TRON}`;

  return send(context, chat,
`<b>Trade ${id}</b> · ${esBsc ? 'BNB Chain (BEP-20)' : 'TRON (TRC-20)'}

Estado: <b>${t.estado}</b>
Monto: <b>${t.monto} USDT</b>
Vendedor: <code>${t.vendedor}</code>
Comprador: <code>${t.comprador}</code>
Árbitro: <code>${t.arbitro}</code>

<a href="${exp}">Ver el contrato en el explorador</a>

${t.estadoIdx === 1 ? '👉 Falta que el comprador marque el pago en CUP.' : ''}
${t.estadoIdx === 2 ? '👉 Falta que el vendedor libere el USDT.' : ''}
${t.estadoIdx >= 3 ? '✅ Esta operación ya está cerrada.' : ''}`);
}

async function tradeTron(context, id) {
  const api = context.env.TRON_API || 'https://api.trongrid.io';
  try {
    const r = await fetch(`${api}/wallet/triggerconstantcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_address: ESCROW_TRON,
        contract_address: ESCROW_TRON,
        function_selector: 'trades(uint256)',
        parameter: BigInt(id).toString(16).padStart(64, '0'),
        visible: true,
      }),
    });
    const d = await r.json();
    const hex = d && d.constant_result && d.constant_result[0];
    if (!hex) return { ok: false, error: 'la red no respondió' };
    const t = decodificarTrade(hex, 6, true);
    if (t.existe) {
      // Las direcciones vienen en hex (41…); los usuarios esperan el formato T…
      t.vendedor = acortar(await hexToBase58(t.vendedor));
      t.comprador = acortar(await hexToBase58(t.comprador));
      t.arbitro = acortar(await hexToBase58(t.arbitro));
    }
    return { ok: true, ...t };
  } catch (e) {
    return { ok: false, error: 'red no disponible' };
  }
}

async function tradeBsc(context, id) {
  const rpc = context.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
  try {
    const data = '0x' + SEL_TRADES + BigInt(id).toString(16).padStart(64, '0');
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to: ESCROW_BSC, data }, 'latest'] }),
    });
    const d = await r.json();
    const hex = d && d.result;
    if (!hex || hex === '0x') return { ok: false, error: 'la red no respondió' };
    const t = decodificarTrade(hex.slice(2), 18, false);
    if (t.existe) {
      t.vendedor = acortar(t.vendedor);
      t.comprador = acortar(t.comprador);
      t.arbitro = acortar(t.arbitro);
    }
    return { ok: true, ...t };
  } catch (e) {
    return { ok: false, error: 'red no disponible' };
  }
}

/* La struct devuelve: seller, buyer, arbitrator, amount, fundedAt, state */
function decodificarTrade(hex, decimales, esTron) {
  const w = i => hex.slice(i * 64, (i + 1) * 64);
  const dir = i => {
    const h = w(i).slice(24);
    return esTron ? '41' + h : '0x' + h;   // TRON usa prefijo 41 en hex
  };
  const num = i => BigInt('0x' + w(i));

  const seller = dir(0);
  if (/^(0x)?0*$/.test(seller.replace(/^41/, ''))) return { existe: false };

  const monto = Number(num(3)) / 10 ** decimales;
  const estadoIdx = Number(num(5));

  return {
    existe: true,
    vendedor: seller,
    comprador: dir(1),
    arbitro: dir(2),
    monto: monto.toLocaleString('es-ES', { maximumFractionDigits: 2 }),
    estadoIdx,
    estado: ESTADOS[estadoIdx] || String(estadoIdx),
  };
}

/* 41 + 20 bytes -> base58check (el formato T… que ve el usuario) */
async function hexToBase58(hex41) {
  const h = hex41.replace(/^0x/, '');
  const payload = new Uint8Array(21);
  for (let i = 0; i < 21; i++) payload[i] = parseInt(h.substr(i * 2, 2), 16);
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1));
  const full = new Uint8Array(25);
  full.set(payload); full.set(h2.slice(0, 4), 21);
  const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const b of full) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = AL[Number(n % 58n)] + out; n /= 58n; }
  for (const b of full) { if (b === 0) out = '1' + out; else break; }
  return out;
}

const acortar = a => (a && a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : a);

/* ========================= Tasa ========================= */

async function mostrarTasa(context, chat) {
  try {
    const origin = new URL(context.request.url).origin;
    const r = await fetch(`${origin}/api/cup`);
    const d = await r.json();
    const t = (d && d.rates) || {};
    const lineas = [];
    if (t.USDT) lineas.push(`USDT: <b>${Math.round(t.USDT)} CUP</b>`);
    if (t.BTC) lineas.push(`BTC: <b>${Math.round(t.BTC)} CUP</b> por dólar`);
    if (d && d.usd_cup) lineas.push(`USD efectivo: ${Math.round(d.usd_cup)} CUP`);
    if (!lineas.length) throw new Error('sin datos');
    return send(context, chat,
      `💱 <b>Tasa cripto de hoy</b>\n\n${lineas.join('\n')}\n\n<i>Fuente: elTOQUE. Es una referencia del mercado informal, no un precio de DexCuba.</i>`);
  } catch {
    return send(context, chat, 'No pude leer la tasa ahora mismo. Puedes verla en dexcuba.com.');
  }
}

/* ========================= Tickets ========================= */

const PREGUNTAS = {
  consulta: [
    { k: 'asunto', q: 'Cuéntame en una frase qué necesitas.' },
    { k: 'detalle', q: 'Añade los detalles que creas útiles (qué hiciste, qué esperabas, qué pasó).' },
    { k: 'contacto', q: '¿Cómo prefieres que te respondamos? (aquí en Telegram, o dime otro contacto)' },
  ],
  disputa: [
    { k: 'trade', q: 'Número del trade y red (por ejemplo: <code>7 TRON</code> o <code>3 BSC</code>).' },
    { k: 'rol', q: '¿Eres el comprador o el vendedor?' },
    { k: 'pago', q: 'Si pagaste en CUP: <b>número de transacción</b> del banco o Transfermóvil, importe y hora. Si no pagaste, escribe "no aplica".' },
    { k: 'detalle', q: 'Explica lo ocurrido con tus palabras.' },
  ],
};

async function iniciarTicket(context, chat, tipo) {
  const kv = context.env.OFFERS;
  if (!kv) return send(context, chat, 'El sistema de tickets no está disponible ahora mismo.');

  const state = { tipo, paso: 0, datos: {}, iniciado: new Date().toISOString() };
  await kv.put(`tgstate:${chat}`, JSON.stringify(state), { expirationTtl: 3600 });

  const intro = tipo === 'disputa'
    ? '⚖️ <b>Abrir una disputa</b>\n\nTe haré 4 preguntas. Cuanto más concreto seas, más rápido se resuelve.\n\n⚠️ Nunca te pediré claves ni frases de recuperación.'
    : '🆘 <b>Abrir un ticket</b>\n\nTe haré 3 preguntas y se lo pasamos a una persona.';

  await send(context, chat, intro + '\n\n(Escribe /cancelar para salir)');
  return send(context, chat, PREGUNTAS[tipo][0].q);
}

async function continuarFlujo(context, chat, text, state, msg) {
  const kv = context.env.OFFERS;
  const guion = PREGUNTAS[state.tipo] || PREGUNTAS.consulta;

  // Cortafuegos: si alguien escribe algo que parece una clave, lo frenamos
  if (/\b([a-z]+\s+){11}[a-z]+\b/i.test(text) || /^(0x)?[0-9a-f]{64}$/i.test(text)) {
    return send(context, chat,
      '🛑 <b>Para. Eso parece una clave privada o una frase de recuperación.</b>\n\n' +
      'Nunca las pedimos y no debes enviarlas a nadie. Si ya la compartiste con alguien, ' +
      'mueve tus fondos a una wallet nueva cuanto antes.\n\nSigamos: ' + guion[state.paso].q);
  }

  state.datos[guion[state.paso].k] = text.slice(0, 900);
  state.paso++;

  if (state.paso < guion.length) {
    await kv.put(`tgstate:${chat}`, JSON.stringify(state), { expirationTtl: 3600 });
    return send(context, chat, guion[state.paso].q);
  }

  // Completo: guardamos el ticket y avisamos al administrador
  await kv.delete(`tgstate:${chat}`);
  const id = crypto.randomUUID().slice(0, 6).toUpperCase();
  const ticket = {
    id, tipo: state.tipo,
    chat_id: chat,
    usuario: (msg.from && (msg.from.username ? '@' + msg.from.username : msg.from.first_name)) || '—',
    datos: state.datos,
    estado: 'abierto',
    created_at: new Date().toISOString(),
  };
  await kv.put(`ticket:${ticket.created_at}:${id}`, JSON.stringify(ticket), { expirationTtl: 180 * 24 * 3600 });

  const resumen = Object.entries(state.datos).map(([k, v]) => `<b>${k}</b>: ${escapeHtml(v)}`).join('\n');

  await send(context, chat,
    `✅ Ticket <b>${id}</b> abierto.\n\nLo revisará una persona y te responderá por aquí. ` +
    'Si recuerdas algún dato más, escríbelo y lo añadimos.');

  const admin = context.env.TELEGRAM_ADMIN_CHAT;
  if (admin) {
    await send(context, admin,
      `${state.tipo === 'disputa' ? '⚖️ <b>DISPUTA</b>' : '🆘 <b>Ticket</b>'} <b>${id}</b>\n` +
      `De: ${escapeHtml(ticket.usuario)} (chat <code>${chat}</code>)\n\n${resumen}`);
  }
}

/* ========================= Telegram API ========================= */

async function send(context, chat, text, keyboard) {
  const body = {
    chat_id: chat,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (keyboard) body.reply_markup = keyboard;
  return fetch(`https://api.telegram.org/bot${context.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function answerCallback(context, id) {
  return fetch(`https://api.telegram.org/bot${context.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id }),
  }).catch(() => {});
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
