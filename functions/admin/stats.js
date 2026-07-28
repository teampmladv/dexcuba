// DexCuba — /admin/stats (API de administración)
// Protegida por Cloudflare Access igual que todo /admin/*.
// Devuelve las métricas generales del panel y el estado del sistema.

export async function onRequestGet(context) {
  const offers = context.env.OFFERS;
  const users = context.env.USERS;

  const out = {
    at: new Date().toISOString(),
    sistema: {
      kv_offers: !!offers,
      kv_users: !!users,
      eltoque_token: !!context.env.ELTOQUE_TOKEN,
      vip_wallet: !!context.env.VIP_WALLET,
      // Dirección real de cobro del VIP: para detectar de un vistazo si
      // quedó apuntando a una wallet de pruebas en vez de la de producción.
      vip_wallet_addr: context.env.VIP_WALLET || null,
      vip_token_addr: context.env.VIP_TOKEN_ADDRESS || '(por defecto: USDT oficial)',
      vip_wallet_bsc: context.env.VIP_WALLET_BSC || null,
      // Si TRON_API apunta a Nile/Shasta, TODO el sistema opera en testnet
      tron_api: context.env.TRON_API || '(por defecto: mainnet)',
    },
    metricas: {},
  };

  // Usuarios y planes
  if (users) {
    const now = Date.now();
    let total = 0, vip = 0, biz = 0;
    const list = await users.list({ prefix: 'user:', limit: 1000 });
    for (const k of list.keys) {
      const u = await users.get(k.name, 'json');
      if (!u) continue;
      total++;
      if (u.business_until && new Date(u.business_until).getTime() > now) biz++;
      else if (u.vip_until && new Date(u.vip_until).getTime() > now) vip++;
    }
    out.metricas.usuarios = total;
    out.metricas.vip_activos = vip;
    out.metricas.business_activos = biz;
  }

  // Ofertas, cobros e ingresos
  if (offers) {
    const today = new Date().toISOString().slice(0, 10);
    let ofertas = 0, netswaps = 0, cobrosPend = 0, cobrosPagados = 0, cobrosHoy = 0, volumen = 0;
    let ingresos = 0, pagosSub = 0;
    const list = await offers.list({ limit: 1000 });
    for (const k of list.keys) {
      if (k.name.startsWith('offer:')) {
        const o = await offers.get(k.name, 'json');
        if (!o) continue;
        if (o.type === 'netswap') netswaps++; else ofertas++;
      } else if (k.name.startsWith('pay:')) {
        const p = await offers.get(k.name, 'json');
        if (!p) continue;
        if (p.status === 'pagado') { cobrosPagados++; volumen += p.paid_amount || p.amount || 0; }
        else cobrosPend++;
        if ((p.created_at || '').slice(0, 10) === today) cobrosHoy++;
      }
    }
    // El registro contable de suscripciones vive en el KV USERS
    if (users) {
      const sl = await users.list({ prefix: 'sublog:', limit: 1000 });
      for (const k of sl.keys) {
        const s = await users.get(k.name, 'json');
        if (s) { ingresos += s.amount || 0; pagosSub++; }
      }
    }
    out.metricas.ofertas_p2p = ofertas;
    out.metricas.cambios_de_red = netswaps;
    out.metricas.cobros_pendientes = cobrosPend;
    out.metricas.cobros_pagados = cobrosPagados;
    out.metricas.cobros_hoy = cobrosHoy;
    out.metricas.volumen_cobrado_usdt = Math.round(volumen * 100) / 100;
    out.metricas.ingresos_suscripciones_usdt = Math.round(ingresos * 100) / 100;
    out.metricas.pagos_suscripciones = pagosSub;
  }

  return json(out, 200, { 'Cache-Control': 'no-store' });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
