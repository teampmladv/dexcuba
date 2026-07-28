// DexCuba — /admin/refs  ·  programa de recomendaciones (protegido por Access)
//
//   GET  /admin/refs                      -> saldos por recomendador
//   POST /admin/refs {address, amount, txid} -> registra un pago hecho

export async function onRequestGet(context) {
  const users = context.env.USERS;
  if (!users) return json({ error: 'kv_no_configurado' }, 503);

  const saldos = {};
  const add = (addr, campo, valor) => {
    saldos[addr] = saldos[addr] || { address: addr, alias: '', ganado: 0, pagado: 0, referidos: 0 };
    saldos[addr][campo] += valor;
  };

  const earn = await users.list({ prefix: 'refearn:', limit: 1000 });
  for (const k of earn.keys) {
    const e = await users.get(k.name, 'json');
    if (e) add(k.name.split(':')[1], 'ganado', e.amount || 0);
  }
  const paid = await users.list({ prefix: 'refpaid:', limit: 1000 });
  for (const k of paid.keys) {
    const p = await users.get(k.name, 'json');
    if (p) add(k.name.split(':')[1], 'pagado', p.amount || 0);
  }

  // Alias y número de recomendados
  const list = await users.list({ prefix: 'user:', limit: 1000 });
  for (const k of list.keys) {
    const u = await users.get(k.name, 'json');
    if (!u) continue;
    if (u.referred_by) add(u.referred_by, 'referidos', 1);
    if (saldos[u.address]) saldos[u.address].alias = u.alias || '';
  }

  const out = Object.values(saldos).map(s => ({
    ...s,
    ganado: Math.round(s.ganado * 100) / 100,
    pagado: Math.round(s.pagado * 100) / 100,
    pendiente: Math.round((s.ganado - s.pagado) * 100) / 100,
  })).sort((a, b) => b.pendiente - a.pendiente);

  return json({
    recomendadores: out,
    total_pendiente: Math.round(out.reduce((a, b) => a + b.pendiente, 0) * 100) / 100,
  }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const users = context.env.USERS;
  if (!users) return json({ error: 'kv_no_configurado' }, 503);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }
  const addr = String(b.address || '').trim();
  const amount = Number(b.amount);
  if (!addr || !isFinite(amount) || amount <= 0) return json({ error: 'datos_invalidos' }, 400);

  const at = new Date().toISOString();
  await users.put(`refpaid:${addr}:${at}`, JSON.stringify({
    at, amount: Math.round(amount * 100) / 100, txid: String(b.txid || '').slice(0, 80),
  }), { expirationTtl: 3 * 365 * 24 * 3600 });
  return json({ ok: true });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
