// DexCuba — /api/pay
// Enlaces de cobro NO-CUSTODIALES: el pago va directo de la wallet del pagador
// a la del cobrador. Aquí solo se guarda la solicitud (importe, concepto, red,
// destinatario) y, cuando llega el pago, se verifica CONTRA LA CADENA.
//
//   POST /api/pay {to, network, amount, concept}   -> crea el enlace
//   GET  /api/pay?id=...                           -> datos del cobro
//   PUT  /api/pay {id, txid}                       -> reporta y verifica el pago
//
// Usa el KV OFFERS con prefijo "pay:". Los enlaces caducan a los 30 días.

const TTL = 30 * 24 * 3600;
const LIMIT_FREE = 3;    // enlaces activos simultáneos sin VIP
const LIMIT_VIP = 100;   // «ilimitado» en la práctica, con tope sano
const NETWORKS_OK = ['TRC20', 'BEP20'];
const TRANSFER_TOPIC = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function onRequestPost(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }

  const network = NETWORKS_OK.includes(b.network) ? b.network : null;
  if (!network) return json({ error: 'red_invalida' }, 400);

  const to = String(b.to || '').trim();
  const okAddr = network === 'TRC20'
    ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(to)
    : /^0x[0-9a-fA-F]{40}$/.test(to);
  if (!okAddr) return json({ error: 'direccion_invalida' }, 400);

  const amount = Number(b.amount);
  if (!isFinite(amount) || amount <= 0 || amount > 1000000) return json({ error: 'importe_invalido' }, 400);

  const concept = String(b.concept || '').trim().slice(0, 120);

  // Alias del cobrador si tiene cuenta (opcional, mejora la confianza)
  let alias = '';
  const users = context.env.USERS;
  if (users) {
    const u = await users.get(`user:${to}`, 'json');
    if (u && u.alias) alias = u.alias;
  }

  // Límite de enlaces activos por wallet de destino: 3 gratis, ilimitado VIP.
  let isVip = false, isBiz = false;
  if (users) {
    const u = await users.get(`user:${to}`, 'json');
    isVip = !!(u && u.vip_until && new Date(u.vip_until) > new Date());
    isBiz = !!(u && u.business_until && new Date(u.business_until) > new Date());
  }
  const today = new Date().toISOString().slice(0, 10);
  const list = await kv.list({ prefix: 'pay:', limit: 1000 });
  let active = 0, activePos = 0, posToday = 0;
  for (const k of list.keys) {
    const p = await kv.get(k.name, 'json');
    if (!p || p.to !== to) continue;
    if (p.status === 'pendiente') { if (p.mode === 'pos') activePos++; else active++; }
    if (p.mode === 'pos' && (p.created_at || '').slice(0, 10) === today) posToday++;
  }
  if (b.mode === 'pos') {
    if (activePos >= 5) {
      return json({ error: 'limite_alcanzado', limit: 5, hint: 'Demasiados cobros de mostrador abiertos; caducan solos en 15 min.' }, 429);
    }
    // Límite diario del mostrador por plan: 10 gratis, 30 VIP, ilimitado Business
    const dayLimit = isBiz ? 100000 : (isVip ? 30 : 10);
    if (posToday >= dayLimit) {
      return json({
        error: 'limite_diario', limit: dayLimit, vip: isVip, business: isBiz,
        hint: 'Con DexCuba Business el mostrador no tiene límite diario.',
      }, 429);
    }
  }
  const limit = isVip ? LIMIT_VIP : LIMIT_FREE;
  if (b.mode !== 'pos' && active >= limit) {
    return json({
      error: 'limite_alcanzado', limit, vip: isVip,
      hint: isVip ? null : 'Con DexCuba VIP tienes enlaces de cobro ilimitados.',
    }, 429);
  }

  const isPos = b.mode === 'pos';
  const id = crypto.randomUUID().slice(0, 8);
  const pay = {
    id, to, network,
    amount: Math.round(amount * 100) / 100,
    concept, alias,
    mode: isPos ? 'pos' : 'link',
    status: 'pendiente',
    txid: null,
    created_at: new Date().toISOString(),
  };
  // Los cobros de mostrador caducan en 15 min: son para el cliente que está delante.
  await kv.put(`pay:${id}`, JSON.stringify(pay), { expirationTtl: isPos ? 900 : TTL });
  return json({ ok: true, id, pay }, 201);
}

export async function onRequestGet(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);
  const url = new URL(context.request.url);

  // Historial de cobros del usuario autenticado (con su sesión de wallet)
  if (url.searchParams.get('list')) {
    const me = await whoami(context);
    if (!me) return json({ error: 'no_autenticado' }, 401);
    const list = await kv.list({ prefix: 'pay:', limit: 1000 });
    const mine = [];
    for (const k of list.keys) {
      const p = await kv.get(k.name, 'json');
      if (p && p.to === me) mine.push(p);
    }
    mine.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return json({ pays: mine }, 200, { 'Cache-Control': 'no-store' });
  }

  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'falta_id' }, 400);
  const pay = await kv.get(`pay:${id}`, 'json');
  if (!pay) return json({ error: 'no_encontrado_o_caducado' }, 404);

  // Autodetección: aunque el cliente pague a mano (sin pasar por la página),
  // se escanea la cadena buscando un Transfer que cuadre.
  if (url.searchParams.get('check') && pay.status === 'pendiente') {
    const found = pay.network === 'TRC20'
      ? await scanTron(context, pay)
      : await scanBsc(context, pay);
    if (found) {
      const guard = await kv.get(`pay_tx:${found.txid}`);
      if (!guard) {
        pay.status = 'pagado';
        pay.txid = found.txid;
        pay.paid_at = new Date().toISOString();
        pay.paid_amount = found.amount;
        await kv.put(`pay:${id}`, JSON.stringify(pay), { expirationTtl: TTL });
        await kv.put(`pay_tx:${found.txid}`, id, { expirationTtl: TTL });
      }
    }
  }
  // Alias e insignia VIP frescos del cobrador (señal de confianza para el pagador)
  const users = context.env.USERS;
  if (users) {
    const u = await users.get(`user:${pay.to}`, 'json');
    if (u) {
      pay.alias = u.alias || pay.alias || '';
      pay.vip = !!(u.vip_until && new Date(u.vip_until) > new Date());
      pay.rating = u.rating || null;
      pay.trades_ok = u.trades_ok || 0;
    }
  }
  return json({ pay }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPut(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }
  const id = String(b.id || '');
  const txid = String(b.txid || '').trim();
  const pay = await kv.get(`pay:${id}`, 'json');
  if (!pay) return json({ error: 'no_encontrado_o_caducado' }, 404);
  if (pay.status === 'pagado') return json({ ok: true, pay });

  const verified = pay.network === 'TRC20'
    ? await verifyTron(context, pay, txid)
    : await verifyBsc(context, pay, txid);

  if (!verified.ok) return json({ error: verified.error }, 400);

  pay.status = 'pagado';
  pay.txid = txid;
  pay.paid_at = new Date().toISOString();
  pay.paid_amount = verified.amount;
  await kv.put(`pay:${id}`, JSON.stringify(pay), { expirationTtl: TTL });
  return json({ ok: true, pay });
}

/* ---- verificación TRC-20 (TRON) ---- */
async function verifyTron(context, pay, txid) {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return { ok: false, error: 'txid_invalido' };
  const api = context.env.TRON_API || 'https://api.trongrid.io';
  let info;
  try {
    const r = await fetch(`${api}/wallet/gettransactioninfobyid`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txid }),
    });
    info = await r.json();
  } catch { return { ok: false, error: 'red_no_disponible' }; }
  if (!info || !info.id) return { ok: false, error: 'tx_no_encontrada' };
  if (info.receipt && info.receipt.result && info.receipt.result !== 'SUCCESS')
    return { ok: false, error: 'tx_fallida' };

  const toHex = b58ToHex(pay.to).slice(-40).toLowerCase();
  for (const lg of info.log || []) {
    if (!lg.topics || lg.topics[0] !== TRANSFER_TOPIC) continue;
    const dest = (lg.topics[2] || '').slice(-40).toLowerCase();
    if (dest !== toHex) continue;
    const amount = Number(BigInt('0x' + lg.data)) / 1e6;
    if (amount >= pay.amount * 0.98) return { ok: true, amount };
  }
  return { ok: false, error: 'pago_no_encontrado_en_tx' };
}

/* ---- verificación BEP-20 (BSC) ---- */
async function verifyBsc(context, pay, txid) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txid)) return { ok: false, error: 'txid_invalido' };
  const rpc = context.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
  let rec;
  try {
    const r = await fetch(rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txid] }),
    });
    rec = (await r.json()).result;
  } catch { return { ok: false, error: 'red_no_disponible' }; }
  if (!rec) return { ok: false, error: 'tx_no_encontrada' };
  if (rec.status !== '0x1') return { ok: false, error: 'tx_fallida' };

  const toHex = pay.to.slice(2).toLowerCase();
  for (const lg of rec.logs || []) {
    if (!lg.topics || lg.topics[0] !== '0x' + TRANSFER_TOPIC) continue;
    const dest = (lg.topics[2] || '').slice(-40).toLowerCase();
    if (dest !== toHex) continue;
    const amount = Number(BigInt(lg.data)) / 1e18; // USDT BEP-20: 18 decimales
    if (amount >= pay.amount * 0.98) return { ok: true, amount };
  }
  return { ok: false, error: 'pago_no_encontrado_en_tx' };
}

/* Busca en TRON un Transfer de USDT entrante que cuadre con el cobro */
async function scanTron(context, pay) {
  const api = context.env.TRON_API || 'https://api.trongrid.io';
  const usdt = context.env.TRON_USDT || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
  const since = Date.parse(pay.created_at) - 60000;
  try {
    const r = await fetch(`${api}/v1/accounts/${pay.to}/transactions/trc20?only_to=true&limit=50&min_timestamp=${since}`);
    const d = await r.json();
    for (const t of d.data || []) {
      if (!t.token_info || t.token_info.address !== usdt) continue;
      const dec = t.token_info.decimals || 6;
      const amount = Number(t.value) / 10 ** dec;
      if (amount >= pay.amount * 0.98) return { txid: t.transaction_id, amount };
    }
  } catch (e) {}
  return null;
}

/* Busca en BSC un Transfer de USDT entrante en los últimos ~2400 bloques (~2 h) */
async function scanBsc(context, pay) {
  const rpc = context.env.BSC_RPC || 'https://bsc-dataseed.binance.org';
  const usdt = context.env.BSC_USDT || '0x55d398326f99059fF775485246999027B3197955';
  const call = (method, params) => fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then(r => r.json()).then(d => d.result);
  try {
    const latest = parseInt(await call('eth_blockNumber', []), 16);
    const fromBlock = '0x' + Math.max(0, latest - 2400).toString(16);
    const logs = await call('eth_getLogs', [{
      fromBlock, toBlock: 'latest', address: usdt,
      topics: ['0x' + TRANSFER_TOPIC, null, '0x' + pay.to.slice(2).toLowerCase().padStart(64, '0')],
    }]);
    for (const lg of logs || []) {
      const amount = Number(BigInt(lg.data)) / 1e18;
      if (amount >= pay.amount * 0.98) return { txid: lg.transactionHash, amount };
    }
  } catch (e) {}
  return null;
}

async function whoami(context) {
  const users = context.env.USERS;
  if (!users) return null;
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await users.get(`session:${token}`);
}

/* base58 -> hex (para comparar direcciones TRON en los logs) */
function b58ToHex(b58) {
  const AL = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n;
  for (const c of b58) { const i = AL.indexOf(c); if (i < 0) return ''; n = n * 58n + BigInt(i); }
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  return hex.slice(0, -8);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}
