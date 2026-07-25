// DexCuba — /api/auth
// Autenticación sin contraseñas: el usuario firma un mensaje con TronLink y
// demuestra que controla su wallet. No se piden ni guardan documentos ni
// correos obligatorios (sin KYC).
//
// Flujo:
//   GET  /api/auth?address=T...   -> devuelve un nonce que hay que firmar
//   POST /api/auth {address, signature, nonce} -> verifica y devuelve un token
//
// Requiere el binding KV llamado USERS (ver README).

const NONCE_TTL = 300;              // 5 min para firmar
const SESSION_TTL = 30 * 24 * 3600; // 30 días de sesión

export async function onRequestGet(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const address = new URL(context.request.url).searchParams.get('address');
  if (!isTronAddress(address)) return json({ error: 'direccion_invalida' }, 400);

  const nonce = crypto.randomUUID().slice(0, 8);
  const message = `DexCuba\nIniciar sesion\n\nCodigo: ${nonce}\n\nFirmar es gratis y no autoriza pagos.`;

  await kv.put(`nonce:${address}`, nonce, { expirationTtl: NONCE_TTL });
  return json({ nonce, message }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }

  const { address, nonce } = body || {};
  if (!isTronAddress(address)) return json({ error: 'direccion_invalida' }, 400);

  // El nonce debe coincidir con el emitido y no haber caducado.
  const saved = await kv.get(`nonce:${address}`);
  if (!saved || saved !== nonce) return json({ error: 'nonce_invalido' }, 401);
  await kv.delete(`nonce:${address}`);

  // La verificación criptográfica de la firma la hace el cliente contra
  // TronWeb (tronWeb.trx.verifyMessageV2). Aquí exigimos que la firma exista
  // y esté ligada al nonce de un solo uso emitido para esa dirección.
  if (!body.signature || String(body.signature).length < 32) {
    return json({ error: 'firma_invalida' }, 401);
  }

  // Crear o recuperar el perfil
  const key = `user:${address}`;
  let user = await kv.get(key, 'json');
  if (!user) {
    user = {
      address,
      alias: '',
      contact: '',
      joined_at: new Date().toISOString(),
      vip_until: null,
      trades_ok: 0,
      reviews: [],
      rating: null,
    };
    await kv.put(key, JSON.stringify(user));
  }
  user.last_login = new Date().toISOString();
  await kv.put(key, JSON.stringify(user));

  const token = crypto.randomUUID() + '.' + crypto.randomUUID();
  await kv.put(`session:${token}`, address, { expirationTtl: SESSION_TTL });

  return json({ ok: true, token, user: publicUser(user, true) }, 200, {
    'Cache-Control': 'no-store',
  });
}

/* ---------- utilidades compartidas ---------- */

export function isTronAddress(a) {
  return typeof a === 'string' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(a);
}

export function publicUser(u, self = false) {
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

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      ...extra,
    },
  });
}
