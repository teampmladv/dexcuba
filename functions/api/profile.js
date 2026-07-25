// DexCuba — /api/profile
// Perfil público y reputación. Sin KYC: solo alias, contacto opcional,
// historial de operaciones y valoraciones de otros usuarios.
//
//   GET  /api/profile?address=T...     -> perfil público de alguien
//   GET  /api/profile  (con token)     -> tu propio perfil
//   POST /api/profile  {alias, contact} -> actualiza tu perfil (requiere token)
//   PUT  /api/profile  {target, score, comment, trade_id} -> deja una valoración

const MAX_REVIEWS = 100;

export async function onRequestGet(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const url = new URL(context.request.url);
  const address = url.searchParams.get('address');

  if (address) {
    if (!isTronAddress(address)) return json({ error: 'direccion_invalida' }, 400);
    const u = await kv.get(`user:${address}`, 'json');
    if (!u) return json({ error: 'no_encontrado' }, 404);
    return json({ user: publicUser(u), reviews: (u.reviews || []).slice(-20).reverse() });
  }

  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);
  const u = await kv.get(`user:${me}`, 'json');
  return json({ user: publicUser(u, true), reviews: (u.reviews || []).slice(-20).reverse() });
}

export async function onRequestPost(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }

  const u = await kv.get(`user:${me}`, 'json');
  if (!u) return json({ error: 'no_encontrado' }, 404);

  if (typeof body.alias === 'string') u.alias = body.alias.trim().slice(0, 24);
  if (typeof body.contact === 'string') u.contact = body.contact.trim().slice(0, 60);

  await kv.put(`user:${me}`, JSON.stringify(u));
  return json({ ok: true, user: publicUser(u, true) });
}

// Dejar una valoración a otro usuario tras operar con él.
export async function onRequestPut(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const me = await whoami(context);
  if (!me) return json({ error: 'no_autenticado' }, 401);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }

  const { target, score, comment, trade_id } = body || {};
  if (!isTronAddress(target)) return json({ error: 'destinatario_invalido' }, 400);
  if (target === me) return json({ error: 'no_puedes_valorarte' }, 400);
  const s = Number(score);
  if (!Number.isInteger(s) || s < 1 || s > 5) return json({ error: 'puntuacion_invalida' }, 400);

  // Una valoración por par de usuarios y trade
  const guard = `review:${me}:${target}:${trade_id || 'x'}`;
  if (await kv.get(guard)) return json({ error: 'ya_valoraste' }, 409);

  const u = await kv.get(`user:${target}`, 'json');
  if (!u) return json({ error: 'no_encontrado' }, 404);

  u.reviews = u.reviews || [];
  u.reviews.push({
    from: me,
    score: s,
    comment: String(comment || '').trim().slice(0, 160),
    trade_id: trade_id ? String(trade_id).slice(0, 20) : null,
    at: new Date().toISOString(),
  });
  if (u.reviews.length > MAX_REVIEWS) u.reviews = u.reviews.slice(-MAX_REVIEWS);

  const sum = u.reviews.reduce((a, r) => a + r.score, 0);
  u.rating = Math.round((sum / u.reviews.length) * 10) / 10;
  u.trades_ok = (u.trades_ok || 0) + 1;

  await kv.put(`user:${target}`, JSON.stringify(u));
  await kv.put(guard, '1', { expirationTtl: 365 * 24 * 3600 });

  return json({ ok: true, rating: u.rating, reviews_count: u.reviews.length });
}

/* ---------- utilidades ---------- */

export async function whoami(context) {
  const kv = context.env.USERS;
  const auth = context.request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return await kv.get(`session:${token}`);
}

function isTronAddress(a) {
  return typeof a === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
}

function publicUser(u, self = false) {
  if (!u) return null;
  const vip = u.vip_until && new Date(u.vip_until) > new Date();
  const out = {
    address: u.address,
    alias: u.alias || '',
    joined_at: u.joined_at,
    trades_ok: u.trades_ok || 0,
    rating: u.rating,
    reviews_count: (u.reviews || []).length,
    vip,
  };
  if (self) {
    out.contact = u.contact || '';
    out.vip_until = u.vip_until;
  }
  return out;
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
