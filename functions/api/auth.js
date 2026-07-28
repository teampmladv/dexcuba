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

import { verifyEvmSignature, verifyTronSignature, isEvmAddress } from '../lib/verify.js';
import { refCode } from './ref.js';

const NONCE_TTL = 300;              // 5 min para firmar
const SESSION_TTL = 30 * 24 * 3600; // 30 días de sesión

export async function onRequestGet(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  let address = new URL(context.request.url).searchParams.get('address');
  if (isEvmAddress(address)) address = address.toLowerCase();
  else if (!isTronAddress(address)) return json({ error: 'direccion_invalida' }, 400);

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

  let { address, nonce } = body || {};
  const isEvm = isEvmAddress(address);
  if (isEvm) address = address.toLowerCase();
  else if (!isTronAddress(address)) return json({ error: 'direccion_invalida' }, 400);

  // El nonce debe coincidir con el emitido y no haber caducado.
  const saved = await kv.get(`nonce:${address}`);
  if (!saved || saved !== nonce) return json({ error: 'nonce_invalido' }, 401);
  await kv.delete(`nonce:${address}`);

  // Verificación criptográfica REAL en el servidor: se recupera la clave
  // pública desde la firma (secp256k1) y se deriva la dirección; si no
  // coincide con la declarada, la firma es falsa. Sin atajos.
  const message = `DexCuba\nIniciar sesion\n\nCodigo: ${nonce}\n\nFirmar es gratis y no autoriza pagos.`;
  const okSig = isEvm
    ? verifyEvmSignature(address, message, String(body.signature || ''))
    : await verifyTronSignature(address, message, String(body.signature || ''));
  if (!okSig) return json({ error: 'firma_invalida' }, 401);

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
    // Atribución de la recomendación: SOLO al crear la cuenta y una única vez.
    // Después no se puede cambiar, ni siquiera enviando otro código.
    const ref = String(body.ref || '').toUpperCase().trim();
    if (/^[A-Z0-9]{6}$/.test(ref)) {
      const owner = await kv.get(`refcode:${ref}`);
      if (owner && owner !== address) user.referred_by = owner;
    }
    await kv.put(key, JSON.stringify(user));
  }
  // Índice del código propio (idempotente): permite resolver código -> cuenta
  await kv.put(`refcode:${refCode(address)}`, address);
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
