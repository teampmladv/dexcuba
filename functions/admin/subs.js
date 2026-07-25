// DexCuba — /admin/subs (API de administración)
// Protegida por Cloudflare Access igual que todo /admin/*: solo tu correo entra.
//
//   GET /admin/subs -> { stats, subs, expiring }
//     stats:    totales de ingresos y suscripciones por plan
//     subs:     registro contable de pagos validados (el más reciente primero)
//     expiring: cuentas cuyo plan caduca en los próximos 14 días

export async function onRequestGet(context) {
  const kv = context.env.USERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  // Registro contable
  const logList = await kv.list({ prefix: 'sublog:', limit: 1000 });
  const subs = [];
  for (const k of logList.keys) {
    const s = await kv.get(k.name, 'json');
    if (s) subs.push(s);
  }
  subs.sort((a, b) => (a.at < b.at ? 1 : -1));

  const stats = {
    total_usdt: Math.round(subs.reduce((t, s) => t + (s.amount || 0), 0) * 100) / 100,
    pagos: subs.length,
    vip: subs.filter(s => s.plan === 'vip').length,
    business: subs.filter(s => s.plan === 'business').length,
  };

  // Planes activos y caducidades próximas (escaneo de cuentas)
  const now = Date.now();
  const soon = now + 14 * 24 * 3600 * 1000;
  let activeVip = 0, activeBiz = 0;
  const expiring = [];
  const userList = await kv.list({ prefix: 'user:', limit: 1000 });
  for (const k of userList.keys) {
    const u = await kv.get(k.name, 'json');
    if (!u) continue;
    const bu = u.business_until ? new Date(u.business_until).getTime() : 0;
    const vu = u.vip_until ? new Date(u.vip_until).getTime() : 0;
    if (bu > now) activeBiz++;
    else if (vu > now) activeVip++;
    const best = Math.max(bu, vu);
    if (best > now && best < soon) {
      expiring.push({
        address: u.address,
        alias: u.alias || '',
        plan: bu > now ? 'business' : 'vip',
        until: new Date(best).toISOString(),
      });
    }
  }
  expiring.sort((a, b) => (a.until > b.until ? 1 : -1));
  stats.activos_vip = activeVip;
  stats.activos_business = activeBiz;

  return json({ stats, subs, expiring }, 200, { 'Cache-Control': 'no-store' });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
