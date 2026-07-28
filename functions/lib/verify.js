// DexCuba — verificación criptográfica de firmas de wallet (servidor)
// Soporta las dos familias:
//   · EVM (MetaMask, Trust…): personal_sign  -> prefijo "\x19Ethereum Signed Message:\n"
//   · TRON (TronLink…):       signMessageV2  -> prefijo "\x19TRON Signed Message:\n"
// En ambas se recupera la clave pública desde la firma (secp256k1) y se deriva
// la dirección; si coincide con la declarada, la firma es auténtica.
// Librerías vendorizadas y auditadas: noble-secp256k1 (Paul Miller) y js-sha3.

import * as secp from '../lib/secp256k1.js';
import sha3 from '../lib/sha3.js';

const keccak = sha3.keccak_256;

export function isEvmAddress(a) {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
}

function utf8(s) { return new TextEncoder().encode(s); }
function hexToBytes(h) {
  h = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b) {
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/* Divide la firma 65 bytes (r,s,v) y normaliza v a 0/1 */
function splitSig(signature) {
  const raw = hexToBytes(String(signature));
  if (raw.length !== 65) return null;
  const rs = raw.slice(0, 64);
  let v = raw[64];
  if (v >= 27) v -= 27;
  if (v !== 0 && v !== 1) return null;
  return { rs, v };
}

function recoverAddressBytes(msgHashBytes, signature) {
  const s = splitSig(signature);
  if (!s) return null;
  // Clave pública sin comprimir (65 bytes, empieza por 0x04)
  const pub = secp.recoverPublicKey(msgHashBytes, s.rs, s.v, false);
  if (!pub) return null;
  // Dirección = últimos 20 bytes de keccak256(pubkey sin el prefijo 0x04)
  const h = keccak.array(pub.slice(1));
  return new Uint8Array(h.slice(12));
}

/* ---------- EVM (personal_sign) ---------- */
export function verifyEvmSignature(address, message, signature) {
  try {
    const msg = utf8(message);
    const prefixed = new Uint8Array([...utf8('\x19Ethereum Signed Message:\n' + msg.length), ...msg]);
    const hash = new Uint8Array(keccak.array(prefixed));
    const addr = recoverAddressBytes(hash, signature);
    if (!addr) return false;
    return ('0x' + bytesToHex(addr)) === address.toLowerCase();
  } catch (e) { return false; }
}

/* ---------- TRON (signMessageV2 / TIP-191) ---------- */
export async function verifyTronSignature(address, message, signature) {
  try {
    const msg = utf8(message);
    const prefixed = new Uint8Array([...utf8('\x19TRON Signed Message:\n' + msg.length), ...msg]);
    const hash = new Uint8Array(keccak.array(prefixed));
    const addr20 = recoverAddressBytes(hash, signature);
    if (!addr20) return false;
    const derived = await toTronBase58(addr20);
    return derived === address;
  } catch (e) { return false; }
}

/* 0x41 + 20 bytes -> base58check (doble SHA-256, WebCrypto) */
async function toTronBase58(addr20) {
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addr20, 1);
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', payload));
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1));
  const full = new Uint8Array(25);
  full.set(payload); full.set(h2.slice(0, 4), 21);
  return base58(full);
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
  return out;
}
