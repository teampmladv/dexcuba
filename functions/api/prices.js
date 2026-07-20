// DexCuba — Pages Function (Cloudflare Worker)
// Ruta: /api/prices
// Estrategia: caché edge 120 s → CoinGecko (con clave opcional) → Binance (respaldo) → último dato bueno.

const COINS = ['bitcoin', 'ethereum', 'tether', 'tron', 'usd-coin', 'litecoin'];
const BINANCE_MAP = {
  bitcoin: 'BTCUSDT',
  ethereum: 'ETHUSDT',
  tron: 'TRXUSDT',
  litecoin: 'LTCUSDT',
};

export async function onRequestGet(context) {
  const cache = caches.default;
  const origin = new URL(context.request.url).origin;
  const cacheKey = new Request(origin + '/api/prices');
  const staleKey = new Request(origin + '/api/prices-last-good');

  // 1. Caché fresca (120 s)
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2. Proveedor principal: CoinGecko
  let data = await fromCoinGecko(context.env.COINGECKO_API_KEY);
  let source = 'coingecko';

  // 3. Respaldo: Binance (API pública, sin clave; USDT ≈ USD)
  if (!data) {
    data = await fromBinance();
    source = 'binance';
  }

  // 4. Último recurso: el último dato bueno guardado (hasta 24 h)
  if (!data) {
    const stale = await cache.match(staleKey);
    if (stale) return stale;
    return json({ error: 'all_providers_failed' }, 502);
  }

  const res = json(data, 200, {
    'Cache-Control': 'public, max-age=120',
    'Access-Control-Allow-Origin': '*',
    'x-price-source': source,
  });

  context.waitUntil(
    Promise.all([
      cache.put(cacheKey, res.clone()),
      cache.put(
        staleKey,
        json(data, 200, {
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
          'x-price-source': source + '-stale',
        })
      ),
    ])
  );
  return res;
}

async function fromCoinGecko(apiKey) {
  try {
    const url =
      'https://api.coingecko.com/api/v3/simple/price' +
      `?ids=${COINS.join(',')}` +
      '&vs_currencies=usd&include_24hr_change=true';
    const headers = { accept: 'application/json', 'user-agent': 'dexcuba-wallet' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;
    const r = await fetch(url, { headers });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.bitcoin ? j : null;
  } catch {
    return null;
  }
}

async function fromBinance() {
  try {
    const symbols = Object.values(BINANCE_MAP);
    const url =
      'https://api.binance.com/api/v3/ticker/24hr?symbols=' +
      encodeURIComponent(JSON.stringify(symbols));
    const r = await fetch(url, { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr)) return null;
    const bySym = Object.fromEntries(arr.map((t) => [t.symbol, t]));
    // Las stablecoins se fijan a 1 USD (los pares de Binance cotizan contra USDT)
    const out = {
      tether: { usd: 1.0, usd_24h_change: 0 },
      'usd-coin': { usd: 1.0, usd_24h_change: 0 },
    };
    for (const [id, sym] of Object.entries(BINANCE_MAP)) {
      const t = bySym[sym];
      if (!t) continue;
      out[id] = {
        usd: parseFloat(t.lastPrice),
        usd_24h_change: parseFloat(t.priceChangePercent),
      };
    }
    return out.bitcoin ? out : null;
  } catch {
    return null;
  }
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
