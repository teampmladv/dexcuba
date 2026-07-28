// DexCuba — /admin/mod (API de administración)
// Protegida por Cloudflare Access igual que todo /admin/*.
//
//   GET    /admin/mod?what=offers  -> todas las ofertas (incl. cambio de red)
//   GET    /admin/mod?what=users   -> todas las cuentas con su plan y reputación
//   DELETE /admin/mod?offer=ID     -> elimina una oferta (moderación)

export async function onRequestGet(context) {
  const offers = context.env.OFFERS;
  const users = context.env.USERS;
  const what = new URL(context.request.url).searchParams.get('what') || 'offers';

  if (what === 'users') {
    if (!users) return json({ error: 'kv_no_configurado' }, 503);
    const now = Date.now();
    const out = [];
    const list = await users.list({ prefix: 'user:', limit: 1000 });
    for (const k of list.keys) {
      const u = await users.get(k.name, 'json');
      if (!u) continue;
      out.push({
        address: u.address,
        alias: u.alias || '',
        joined_at: u.joined_at || null,
        rating: u.rating || null,
        trades_ok: u.trades_ok || 0,
        plan: (u.business_until && new Date(u.business_until).getTime() > now) ? 'business'
            : (u.vip_until && new Date(u.vip_until).getTime() > now) ? 'vip' : 'gratis',
        vip_until: u.vip_until || null,
        business_until: u.business_until || null,
      });
    }
    out.sort((a, b) => ((a.joined_at || '') < (b.joined_at || '') ? 1 : -1));
    return json({ users: out }, 200, { 'Cache-Control': 'no-store' });
  }

  if (!offers) return json({ error: 'kv_no_configurado' }, 503);
  const out = [];
  const list = await offers.list({ prefix: 'offer:', limit: 1000 });
  for (const k of list.keys) {
    const o = await offers.get(k.name, 'json');
    if (o) out.push(o);
  }
  out.sort((a, b) => ((a.created_at || '') < (b.created_at || '') ? 1 : -1));
  return json({ offers: out }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestDelete(context) {
  const offers = context.env.OFFERS;
  if (!offers) return json({ error: 'kv_no_configurado' }, 503);
  const id = new URL(context.request.url).searchParams.get('offer');
  if (!id) return json({ error: 'falta_id' }, 400);
  await offers.delete(`offer:${id}`);
  return json({ ok: true, deleted: id });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
