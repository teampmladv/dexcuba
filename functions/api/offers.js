// DexCuba — Pages Function: /api/offers
// Tablero P2P NO-CUSTODIAL. Solo guarda anuncios. Nunca toca fondos.
//
// Beneficios VIP implementados aquí:
//   · Ofertas destacadas: las de usuarios VIP se ordenan primero y llevan marca.
//   · Límites de publicación: 3 ofertas activas para usuarios normales, 15 VIP.
//
// Bindings requeridos: OFFERS (ofertas) y USERS (cuentas/reputación).

const TTL = 7 * 24 * 60 * 60; // 7 días
const ASSETS = ['USDT', 'BTC'];
const NETWORKS_OK = ['TRC20', 'BEP20'];
const SWAP_DIRECTIONS = ['TRC20_TO_BEP20', 'BEP20_TO_TRC20'];
const SIDES = ['vendo', 'compro'];
const METHODS = ['Efectivo', 'Transferencia CUP', 'Transfermóvil', 'Enzona', 'Zelle', 'Saldo móvil'];

const LIMIT_FREE = 3;
const LIMIT_VIP = 15;

export async function onRequestGet(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const list = await kv.list({ prefix: 'offer:', limit: 1000 });
  const raw = await Promise.all(
    list.keys.map(async (k) => {
      const v = await kv.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );
  let offers = raw.filter(Boolean);

  // Enriquecer con la reputación y el estado VIP del anunciante
  const users = context.env.USERS;
  if (users) {
    const addrs = [...new Set(offers.map((o) => o.owner).filter(Boolean))];
    const profiles = {};
    await Promise.all(
      addrs.map(async (a) => {
        const u = await users.get(`user:${a}`, 'json');
        if (u) {
          profiles[a] = {
            alias: u.alias || '',
            rating: u.rating,
            trades_ok: u.trades_ok || 0,
            vip: !!(u.vip_until && new Date(u.vip_until) > new Date()),
          };
        }
      })
    );
    offers = offers.map((o) => {
      const p = o.owner ? profiles[o.owner] : null;
      return {
        ...o,
        alias: p ? p.alias : '',
        rating: p ? p.rating : null,
        trades_ok: p ? p.trades_ok : 0,
        featured: p ? p.vip : false,
      };
    });
  }

  // Destacadas primero, luego por fecha
  offers.sort((a, b) => {
    if (!!a.featured !== !!b.featured) return a.featured ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  return json({ offers }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }

  const err = validate(body);
  if (err) return json({ error: err }, 400);

  // Si el usuario está autenticado, aplicamos límites y marcamos la autoría.
  const owner = await whoami(context);
  let isVip = false;
  if (owner && context.env.USERS) {
    const u = await context.env.USERS.get(`user:${owner}`, 'json');
    isVip = !!(u && u.vip_until && new Date(u.vip_until) > new Date());

    const mine = await countActiveOffers(kv, owner);
    const limit = isVip ? LIMIT_VIP : LIMIT_FREE;
    if (mine >= limit) {
      return json({
        error: 'limite_alcanzado',
        limit,
        vip: isVip,
        hint: isVip ? null : 'Con DexCuba VIP puedes publicar hasta ' + LIMIT_VIP + ' ofertas.',
      }, 429);
    }
  }

  const id = crypto.randomUUID();
  const delete_token = crypto.randomUUID();
  const offer = body.type === 'netswap' ? {
    id,
    owner: owner || null,
    type: 'netswap',
    direction: body.direction,
    spread_pct: Math.round(Number(body.spread_pct) * 100) / 100,
    min_usd: Math.round(Number(body.min_usd)),
    max_usd: Math.round(Number(body.max_usd)),
    contact: String(body.contact).slice(0, 80),
    note: String(body.note || '').slice(0, 200),
    created_at: new Date().toISOString(),
  } : {
    id,
    owner: owner || null,
    side: body.side,
    asset: body.asset,
    network: body.asset === 'USDT' ? (NETWORKS_OK.includes(body.network) ? body.network : 'TRC20') : null,
    cup_per_usd: Math.round(Number(body.cup_per_usd)),
    min_usd: Math.round(Number(body.min_usd)),
    max_usd: Math.round(Number(body.max_usd)),
    methods: body.methods.filter((m) => METHODS.includes(m)),
    contact: String(body.contact).slice(0, 80),
    note: String(body.note || '').slice(0, 200),
    created_at: new Date().toISOString(),
  };

  await kv.put(`offer:${id}`, JSON.stringify(offer), { expirationTtl: TTL });
  await kv.put(`token:${id}`, delete_token, { expirationTtl: TTL });

  return json({ ok: true, offer: { ...offer, featured: isVip }, delete_token }, 201);
}

export async function onRequestDelete(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (!id) return json({ error: 'faltan_parametros' }, 400);

  const saved = await kv.get(`token:${id}`);
  const owner = await whoami(context);
  let allowed = token && saved && saved === token;
  if (!allowed && owner) {
    const o = await kv.get(`offer:${id}`, 'json');
    allowed = o && o.owner === owner;
  }
  if (!allowed) return json({ error: 'no_autorizado' }, 403);

  await kv.delete(`offer:${id}`);
  await kv.delete(`token:${id}`);
  return json({ ok: true });
}

/* ---------- utilidades ---------- */

async function countActiveOffers(kv, owner) {
  const list = await kv.list({ prefix: 'offer:', limit: 1000 });
  let n = 0;
  for (const k of list.keys) {
    const o = await kv.get(k.name, 'json');
    if (o && o.owner === owner) n++;
  }
  return n;
}

async function whoami(context) {
  const users = context.env.USERS;
  if (!users) return null;
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await users.get(`session:${token}`);
}

function validate(b) {
  if (!b || typeof b !== 'object') return 'cuerpo_vacio';

  // Ofertas de cambio de red (USDT TRC-20 <-> BEP-20 entre usuarios)
  if (b.type === 'netswap') {
    if (!SWAP_DIRECTIONS.includes(b.direction)) return 'direccion_invalida';
    const sp = Number(b.spread_pct);
    if (!isFinite(sp) || sp < 0 || sp > 10) return 'spread_invalido';
    const mn = Number(b.min_usd), mx = Number(b.max_usd);
    if (!isFinite(mn) || !isFinite(mx) || mn <= 0 || mx < mn || mx > 1000000)
      return 'limites_invalidos';
    if (!b.contact || String(b.contact).trim().length < 3) return 'contacto_requerido';
    return null;
  }

  if (!SIDES.includes(b.side)) return 'side_invalido';
  if (!ASSETS.includes(b.asset)) return 'asset_invalido';
  if (b.asset === 'USDT' && b.network && !NETWORKS_OK.includes(b.network)) return 'red_invalida';
  const rate = Number(b.cup_per_usd);
  if (!isFinite(rate) || rate <= 0 || rate > 100000) return 'tasa_invalida';
  const min = Number(b.min_usd), max = Number(b.max_usd);
  if (!isFinite(min) || !isFinite(max) || min <= 0 || max < min || max > 1000000)
    return 'limites_invalidos';
  if (!Array.isArray(b.methods) || b.methods.length === 0) return 'metodos_requeridos';
  if (!b.contact || String(b.contact).trim().length < 3) return 'contacto_requerido';
  return null;
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
