// DexCuba — /api/vip
// Suscripción VIP de 5 USD/año, pagada en USDT a la wallet de DexCuba.
// El pago se verifica ON-CHAIN: el usuario envía el USDT desde su wallet y
// manda el hash de la transacción; aquí se comprueba contra la red que el
// importe, el destino y el remitente son correctos.
//
// Ventaja de este modelo: no se necesita pasarela de pago, ni datos de tarjeta,
// ni almacenar información financiera. Solo se guarda la fecha de caducidad.
//
//   GET  /api/vip                      -> estado de tu suscripción
//   POST /api/vip {txid}               -> canjea un pago y activa/renueva el VIP

const PRICE_VIP = 5;   // plan VIP personal, por año
const PRICE_BIZ = 20;  // plan Business (Gold) para negocios, por año
const PRICE_USDT = PRICE_VIP; // compatibilidad
const YEAR_MS = 365 * 24 * 3600 * 1000;
const TOLERANCE = 0.98;        // acepta pagos con hasta 2% de diferencia

export async function onRequestGet(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);

  const cfg = netConfig(context);
  const u = await kv.get(`user:${me}`, 'json');
  const active = u && u.vip_until && new Date(u.vip_until) > new Date();

  const biz = u && u.business_until && new Date(u.business_until) > new Date();
  return json({
    vip: !!active || !!biz,
    business: !!biz,
    vip_until: u ? u.vip_until : null,
    business_until: u ? u.business_until : null,
    price_usdt: PRICE_VIP,
    price_business: PRICE_BIZ,
    pay_to: cfg.wallet,
    token: cfg.token,
    network: cfg.isTestnet ? 'nile' : 'mainnet',
    benefits: [
      'Tus ofertas aparecen destacadas y las primeras del tablero',
      'Publica hasta 15 ofertas activas (3 en el plan gratuito)',
      'Enlaces de cobro ilimitados (3 activos en el plan gratuito)',
      'Insignia VIP y reputación visibles en tus páginas de cobro',
      'Insignia VIP visible en tu perfil y en tus ofertas',
      'Apoyas el desarrollo de una plataforma sin custodia',
    ],
    benefits_business: [
      'Todo lo del plan VIP',
      'Modo mostrador (POS) sin límite diario de cobros',
      'Pensado para cafeterías, tiendas y negocios que cobran a diario',
    ],
  }, 200, { 'Cache-Control': 'no-store' });
}

/* Configuración de red según el entorno de despliegue.
   En Cloudflare Pages, Production y Preview tienen variables separadas:
   basta con definir los mismos secretos en cada entorno apuntando a la red
   que corresponda (mainnet en producción, Nile en las vistas previas). */
function netConfig(context) {
  const env = context.env;
  const api = env.TRON_API || 'https://api.trongrid.io';
  const isTestnet = api.includes('nile') || api.includes('shasta');
  return {
    api,
    isTestnet,
    wallet: env.VIP_WALLET || null,
    token: env.VIP_TOKEN_ADDRESS || (isTestnet ? null : 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'),
  };
}

export async function onRequestPost(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const cfg = netConfig(context);
  const wallet = cfg.wallet;
  const tokenAddr = cfg.token;
  const apiHost = cfg.api;
  if (!wallet || !tokenAddr) return json({ error: 'vip_no_configurado' }, 503);

  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }
  const txid = String(body.txid || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return json({ error: 'txid_invalido' }, 400);

  // Un pago no puede canjearse dos veces.
  if (await kv.get(`vip_tx:${txid}`)) return json({ error: 'pago_ya_usado' }, 409);

  // Verificar la transacción contra la red TRON.
  let info;
  try {
    const r = await fetch(`${apiHost}/wallet/gettransactioninfobyid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txid }),
    });
    info = await r.json();
  } catch {
    return json({ error: 'red_no_disponible' }, 502);
  }
  if (!info || !info.id) return json({ error: 'tx_no_encontrada' }, 404);
  if (info.receipt && info.receipt.result && info.receipt.result !== 'SUCCESS') {
    return json({ error: 'tx_fallida' }, 400);
  }

  // Buscar el evento Transfer del token esperado, hacia la wallet de DexCuba.
  const check = verifyTransfer(info, tokenAddr, wallet, me);
  if (!check.ok) return json({ error: check.error }, 400);

  // El importe pagado determina el plan: ~20 USDT -> Business, ~5 USDT -> VIP.
  const isBiz = check.amount >= PRICE_BIZ * TOLERANCE;
  const key = `user:${me}`;
  const u = (await kv.get(key, 'json')) || { address: me, joined_at: new Date().toISOString() };
  const now = Date.now();
  if (isBiz) {
    const base = u.business_until && new Date(u.business_until).getTime() > now
      ? new Date(u.business_until).getTime() : now;
    u.business_until = new Date(base + YEAR_MS).toISOString();
    // Business incluye VIP: extender también
    if (!u.vip_until || new Date(u.vip_until).getTime() < new Date(u.business_until).getTime())
      u.vip_until = u.business_until;
  } else {
    const base = u.vip_until && new Date(u.vip_until).getTime() > now
      ? new Date(u.vip_until).getTime() : now;
    u.vip_until = new Date(base + YEAR_MS).toISOString();
  }

  await kv.put(key, JSON.stringify(u));
  await kv.put(`vip_tx:${txid}`, me, { expirationTtl: 2 * 365 * 24 * 3600 });

  // Registro contable para el panel de administración (/admin/suscripciones.html)
  const at = new Date().toISOString();
  await kv.put(`sublog:${at}:${txid.slice(0, 8)}`, JSON.stringify({
    at, address: me, alias: u.alias || '',
    plan: isBiz ? 'business' : 'vip',
    amount: check.amount, txid,
    until: isBiz ? u.business_until : u.vip_until,
  }), { expirationTtl: 3 * 365 * 24 * 3600 });

  return json({ ok: true, vip: true, business: isBiz, vip_until: u.vip_until, business_until: u.business_until || null, paid_usdt: check.amount });
}

/* Comprueba que la transacción contiene un Transfer del token correcto,
   con destino la wallet de DexCuba, importe suficiente y origen el usuario. */
function verifyTransfer(info, tokenAddr, wallet, sender) {
  const logs = info.log || [];
  const TRANSFER_SIG = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const tokenHex = toHex41(tokenAddr).slice(2).toLowerCase();
  const walletHex = toHex41(wallet).slice(2).toLowerCase();
  const senderHex = toHex41(sender).slice(2).toLowerCase();

  for (const lg of logs) {
    if (!lg.topics || lg.topics[0] !== TRANSFER_SIG) continue;
    if ((lg.address || '').toLowerCase() !== tokenHex) continue;
    const from = (lg.topics[1] || '').slice(-40).toLowerCase();
    const to = (lg.topics[2] || '').slice(-40).toLowerCase();
    if (to !== walletHex.slice(-40)) continue;
    if (from !== senderHex.slice(-40)) return { ok: false, error: 'pago_de_otra_wallet' };
    const amount = Number(BigInt('0x' + lg.data)) / 1e6;
    if (amount < PRICE_VIP * TOLERANCE) {
      return { ok: false, error: 'importe_insuficiente' };
    }
    return { ok: true, amount };
  }
  return { ok: false, error: 'pago_no_encontrado_en_tx' };
}

/* base58 -> hex 41... (implementación mínima, sin dependencias) */
function toHex41(b58) {
  const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of b58) {
    const i = AL.indexOf(c);
    if (i < 0) return '';
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  // quitar los 4 bytes de checksum del final
  return '0x' + hex.slice(0, -8);
}

async function whoami(context) {
  const kv = context.env.USERS;
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await kv.get(`session:${token}`);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extra,
    },
  });
}
