// DexCuba — /api/ref  ·  programa de recomendaciones
//
//   GET  /api/ref            -> mis estadísticas (requiere sesión)
//   GET  /api/ref?code=XXXX  -> comprueba a quién pertenece un código (público)
//
// Cómo funciona, en corto:
//   · Cada cuenta tiene un código corto derivado de su dirección.
//   · El enlace dexcuba.com/?ref=CODIGO deja la marca en el navegador.
//   · Al crear cuenta, esa marca se guarda como "quién me recomendó" (una vez
//     y para siempre: no se puede cambiar después).
//   · Cuando un recomendado paga VIP o Business, se acredita el 25% a quien
//     lo trajo. El pago lo hace DexCuba desde el panel de administración:
//     no custodiamos saldos de nadie, es un compromiso de pago registrado.

export const REF_PCT = 25;          // % de la suscripción que gana quien recomienda
export const MIN_PAYOUT = 5;        // USDT mínimos para solicitar el pago

/* Código corto y estable a partir de la dirección (mismo algoritmo en cliente) */
export function refCode(address) {
  const a = String(address || '').toUpperCase().replace(/^0X/, '');
  let h = 5381;
  for (let i = 0; i < a.length; i++) h = ((h * 33) ^ a.charCodeAt(i)) >>> 0;
  return h.toString(36).toUpperCase().slice(0, 6).padStart(6, 'X');
}

export async function onRequestGet(context) {
  const users = context.env.USERS;
  if (!users) return json({ error: 'kv_no_configurado' }, 503);

  const url = new URL(context.request.url);

  // Consulta pública: ¿de quién es este código?
  const code = url.searchParams.get('code');
  if (code) {
    const owner = await users.get(`refcode:${code.toUpperCase()}`);
    if (!owner) return json({ valid: false });
    const u = await users.get(`user:${owner}`, 'json');
    return json({ valid: true, alias: (u && u.alias) || null });
  }

  // Mis estadísticas
  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);

  const code_mine = refCode(me);
  await users.put(`refcode:${code_mine}`, me);   // asegura el índice

  // Recomendados
  const refs = [];
  const list = await users.list({ prefix: 'user:', limit: 1000 });
  for (const k of list.keys) {
    const u = await users.get(k.name, 'json');
    if (u && u.referred_by === me) {
      refs.push({
        alias: u.alias || null,
        desde: (u.joined_at || '').slice(0, 10),
        vip: !!(u.vip_until && new Date(u.vip_until) > new Date()),
      });
    }
  }

  // Ganancias acreditadas y pagos hechos
  let ganado = 0, pagado = 0;
  const earn = await users.list({ prefix: `refearn:${me}:`, limit: 1000 });
  for (const k of earn.keys) {
    const e = await users.get(k.name, 'json');
    if (e) ganado += e.amount || 0;
  }
  const pays = await users.list({ prefix: `refpaid:${me}:`, limit: 1000 });
  for (const k of pays.keys) {
    const p = await users.get(k.name, 'json');
    if (p) pagado += p.amount || 0;
  }

  const pendiente = Math.round((ganado - pagado) * 100) / 100;

  return json({
    code: code_mine,
    link: `${url.origin}/?ref=${code_mine}`,
    pct: REF_PCT,
    min_payout: MIN_PAYOUT,
    referidos: refs.length,
    referidos_vip: refs.filter(r => r.vip).length,
    lista: refs.slice(0, 50),
    ganado: Math.round(ganado * 100) / 100,
    pagado: Math.round(pagado * 100) / 100,
    pendiente,
    puede_cobrar: pendiente >= MIN_PAYOUT,
  }, 200, { 'Cache-Control': 'no-store' });
}

/* Acredita la comisión al recomendador. Se llama desde vip.js al activar un plan. */
export async function creditReferral(env, buyer, amount, txid) {
  const users = env.USERS;
  if (!users) return;
  const u = await users.get(`user:${buyer}`, 'json');
  if (!u || !u.referred_by || u.referred_by === buyer) return;

  const comision = Math.round(amount * REF_PCT) / 100;
  if (comision <= 0) return;

  const at = new Date().toISOString();
  await users.put(`refearn:${u.referred_by}:${at}`, JSON.stringify({
    at, from: buyer, alias: u.alias || '', amount: comision,
    base: amount, txid,
  }), { expirationTtl: 3 * 365 * 24 * 3600 });
}

async function whoami(context) {
  const users = context.env.USERS;
  if (!users) return null;
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await users.get(`session:${token}`);
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
