// DexCuba — Pages Function: /api/offers
// Tablero P2P NO-CUSTODIAL. Solo guarda anuncios (ofertas). Nunca toca fondos.
// La liquidación ocurre billetera-a-billetera entre los usuarios, fuera de aquí.
//
// Requiere un binding de Cloudflare KV llamado OFFERS (ver README).
// Las ofertas caducan solas a los 7 días (expirationTtl de KV).

const TTL = 7 * 24 * 60 * 60; // 7 días
const ASSETS = ['USDT', 'BTC'];
const SIDES = ['vendo', 'compro']; // desde la óptica del maker (vende o compra cripto)
const METHODS = ['Efectivo', 'Transferencia CUP', 'Transfermóvil', 'Enzona', 'Zelle', 'Saldo móvil'];

export async function onRequestGet(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const list = await kv.list({ prefix: 'offer:', limit: 1000 });
  const offers = await Promise.all(
    list.keys.map(async (k) => {
      const v = await kv.get(k.name);
      return v ? JSON.parse(v) : null;
    })
  );
  const active = offers
    .filter(Boolean)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return json({ offers: active }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  const err = validate(body);
  if (err) return json({ error: err }, 400);

  const id = crypto.randomUUID();
  const delete_token = crypto.randomUUID();
  const offer = {
    id,
    side: body.side,
    asset: body.asset,
    cup_per_usd: Math.round(Number(body.cup_per_usd)),
    min_usd: Math.round(Number(body.min_usd)),
    max_usd: Math.round(Number(body.max_usd)),
    methods: body.methods.filter((m) => METHODS.includes(m)),
    contact: String(body.contact).slice(0, 80),
    note: String(body.note || '').slice(0, 200),
    created_at: new Date().toISOString(),
  };

  // Guardamos la oferta y, por separado, el token de borrado (privado).
  await kv.put(`offer:${id}`, JSON.stringify(offer), { expirationTtl: TTL });
  await kv.put(`token:${id}`, delete_token, { expirationTtl: TTL });

  return json({ ok: true, offer, delete_token }, 201);
}

export async function onRequestDelete(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');
  if (!id || !token) return json({ error: 'faltan_parametros' }, 400);

  const saved = await kv.get(`token:${id}`);
  if (!saved || saved !== token) return json({ error: 'no_autorizado' }, 403);

  await kv.delete(`offer:${id}`);
  await kv.delete(`token:${id}`);
  return json({ ok: true });
}

function validate(b) {
  if (!b || typeof b !== 'object') return 'cuerpo_vacio';
  if (!SIDES.includes(b.side)) return 'side_invalido';
  if (!ASSETS.includes(b.asset)) return 'asset_invalido';
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
