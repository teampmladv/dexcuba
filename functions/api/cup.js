// DexCuba — Pages Function: /api/cup
// Tasa representativa del mercado informal (TRMI) de elTOQUE.
// Fuente: elTOQUE (https://eltoque.com) — mostrar siempre el crédito en la UI.
//
// Requiere el secreto ELTOQUE_TOKEN (clave de la API, se solicita gratis en
// https://tasas-token.eltoque.com/). Cuota beta: 5000 req/mes, por eso
// cacheamos 6 h y guardamos el último valor bueno hasta 48 h.
//
// Endpoint oficial: GET https://tasas.eltoque.com/v1/trmi
//   Header: Authorization: Bearer <ELTOQUE_TOKEN>
//   Query:  date_from, date_to (YYYY-MM-DD HH:mm:ss), rango MÁXIMO 24 h.
//   Devuelve { tasas: { USD, ECU(=EUR), MLC, USDT, BTC, TRX, ... }, date }.
// Docs: https://tasas.eltoque.com/docs/  ·  Límite ~1 req/seg.

const DEFAULT_URL = 'https://tasas.eltoque.com/v1/trmi';

export async function onRequestGet(context) {
  const { env } = context;
  const cache = caches.default;
  const origin = new URL(context.request.url).origin;
  const cacheKey = new Request(origin + '/api/cup');
  const staleKey = new Request(origin + '/api/cup-last-good');

  // 1. Caché fresca (6 h)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2. Sin token no podemos consultar: devolvemos el último bueno o un aviso
  if (!env.ELTOQUE_TOKEN) {
    const stale = await cache.match(staleKey);
    if (stale) return stale;
    return json(
      { error: 'missing_token', hint: 'Configura el secreto ELTOQUE_TOKEN' },
      503
    );
  }

  // 3. Consultar a elTOQUE
  const rate = await fromElToque(env);
  if (rate == null) {
    const stale = await cache.match(staleKey);
    if (stale) return stale;
    return json({ error: 'eltoque_unavailable' }, 502);
  }

  const body = {
    usd_cup: rate.usd,
    eur_cup: rate.eur ?? null,
    mlc_cup: rate.mlc ?? null,
    rates: rate.rates,
    updated_at: rate.date ?? null,
    source: 'elTOQUE',
    source_url: 'https://eltoque.com/tasas-de-cambio-cuba',
  };

  const res = json(body, 200, {
    'Cache-Control': 'public, max-age=21600', // 6 h
    'Access-Control-Allow-Origin': '*',
  });

  context.waitUntil(
    Promise.all([
      cache.put(cacheKey, res.clone()),
      cache.put(
        staleKey,
        json(body, 200, {
          'Cache-Control': 'public, max-age=172800', // 48 h de respaldo
          'Access-Control-Allow-Origin': '*',
        })
      ),
    ])
  );
  return res;
}

async function fromElToque(env) {
  const url = env.ELTOQUE_URL || DEFAULT_URL;
  // La API exige un rango <= 24 h. Usamos una ventana de 23h58m (segura).
  const now = new Date();
  const from = new Date(now.getTime() - (24 * 3600 - 120) * 1000);
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' '); // YYYY-MM-DD HH:mm:ss
  const qs = `date_from=${encodeURIComponent(fmt(from))}&date_to=${encodeURIComponent(fmt(now))}`;

  try {
    const r = await fetch(`${url}?${qs}`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${env.ELTOQUE_TOKEN}`,
      },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return normalize(j);
  } catch {
    return null;
  }
}

// Normaliza distintas formas posibles de respuesta a { usd, eur, mlc, rates, date }.
function normalize(j) {
  // Caso A: { tasas: { USD: 620, EUR: 700, MLC: 450 }, date: "..." }
  const t = j.tasas || j.rates || j.data || j;
  const pick = (o, keys) => {
    for (const k of keys) {
      if (o && o[k] != null) {
        const v = typeof o[k] === 'object' ? o[k].value ?? o[k].venta ?? o[k].price : o[k];
        const n = parseFloat(v);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  };
  const usd = pick(t, ['USD', 'usd', 'Dolar', 'dollar']);
  if (usd == null) return null;

  // Mapa de todas las monedas que reconozcamos (para el panel de tasas).
  // Nota: elTOQUE usa "ECU" para el euro en algunas respuestas.
  const wanted = {
    USD: ['USD', 'usd'], EUR: ['EUR', 'ECU', 'eur'], MLC: ['MLC', 'mlc'],
    USDT: ['USDT', 'USDT_TRC20', 'usdt'], BTC: ['BTC', 'btc'], TRX: ['TRX', 'trx'],
    BNB: ['BNB', 'bnb'], CAD: ['CAD', 'cad'], MXN: ['MXN', 'mxn'],
    GBP: ['GBP', 'gbp'], CHF: ['CHF', 'chf'], ZELLE: ['ZELLE', 'zelle'],
  };
  const rates = {};
  for (const [code, keys] of Object.entries(wanted)) {
    const v = pick(t, keys);
    if (v != null) rates[code] = v;
  }

  return {
    usd,
    eur: pick(t, ['EUR', 'ECU', 'eur', 'Euro']),
    mlc: pick(t, ['MLC', 'mlc']),
    rates,
    date: j.date || j.updated_at || j.fecha || null,
  };
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
