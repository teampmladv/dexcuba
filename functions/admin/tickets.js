// DexCuba — /admin/tickets  (protegido por Cloudflare Access, como todo /admin/*)
//
//   GET    /admin/tickets              -> lista de tickets (abiertos primero)
//   POST   /admin/tickets {id, chat_id, respuesta}  -> responde por Telegram
//   PUT    /admin/tickets {key, estado} -> marca abierto/cerrado

export async function onRequestGet(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);

  const out = [];
  const list = await kv.list({ prefix: 'ticket:', limit: 500 });
  for (const k of list.keys) {
    const t = await kv.get(k.name, 'json');
    if (t) out.push({ ...t, key: k.name });
  }
  // Abiertos primero, y dentro de cada grupo los más recientes
  out.sort((a, b) => {
    if (a.estado !== b.estado) return a.estado === 'abierto' ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  return json({ tickets: out, abiertos: out.filter(t => t.estado === 'abierto').length },
    200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost(context) {
  const token = context.env.TELEGRAM_BOT_TOKEN;
  if (!token) return json({ error: 'bot_no_configurado' }, 503);

  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }
  const chat = b.chat_id, texto = String(b.respuesta || '').trim();
  if (!chat || !texto) return json({ error: 'faltan_datos' }, 400);

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat,
      text: `💬 <b>Soporte de DexCuba</b>${b.id ? ` · ticket ${b.id}` : ''}\n\n${escapeHtml(texto)}`,
      parse_mode: 'HTML',
    }),
  });
  const d = await r.json();
  if (!d.ok) return json({ error: 'telegram_rechazo', detalle: d.description }, 502);

  // Dejamos constancia de la respuesta en el propio ticket
  const kv = context.env.OFFERS;
  if (kv && b.key) {
    const t = await kv.get(b.key, 'json');
    if (t) {
      t.respuestas = t.respuestas || [];
      t.respuestas.push({ at: new Date().toISOString(), texto });
      await kv.put(b.key, JSON.stringify(t), { expirationTtl: 180 * 24 * 3600 });
    }
  }
  return json({ ok: true });
}

export async function onRequestPut(context) {
  const kv = context.env.OFFERS;
  if (!kv) return json({ error: 'kv_no_configurado' }, 503);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'json_invalido' }, 400); }
  const t = await kv.get(b.key, 'json');
  if (!t) return json({ error: 'no_encontrado' }, 404);
  t.estado = b.estado === 'cerrado' ? 'cerrado' : 'abierto';
  t.updated_at = new Date().toISOString();
  await kv.put(b.key, JSON.stringify(t), { expirationTtl: 180 * 24 * 3600 });
  return json({ ok: true, estado: t.estado });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extra },
  });
}
