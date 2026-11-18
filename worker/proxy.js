/**
 * Cloudflare Worker for Maple Helper:
 *   GET  /?url=<nexon rankings url>     CORS proxy for the GMS rankings JSON (only www.nexon.com is allowed)
 *   GET  /templates[?class=<key>]       list shared HEXA templates, optionally only one class  (needs KV binding "TEMPLATES")
 *   GET  /templates/:id                 one template
 *   POST /templates                     publish a template (JSON body with classKey; optional PUBLISH_KEY secret → x-publish-key header);
 *                                       409 + {duplicate:{id,name}} if the class already has the same leveling path
 *   PUT  /templates/:id                 admin: replace a template          (ADMIN_KEY secret → x-admin-key header)
 *   DELETE /templates/:id               admin: delete a template
 *   GET  /admin/check                   admin: verify the key
 *   GET  /bank                         skill bank: list classes (classKey, count, updatedAt)
 *   GET  /bank/:classKey               one class's skill bank ('common' = Sol Janus / Hecate / HEXA Stat icons)
 *   PUT  /bank/:classKey               admin: replace a class's skill bank
 *   DELETE /bank/:classKey             admin: delete it
 *   GET  /sync/:key                     fetch a user's data snapshot (key = long random string from the app)   (KV "TEMPLATES")
 *   PUT  /sync/:key                     store a snapshot (≤ 4 MB)
 *
 * Deploy (free):  Workers & Pages → Create Worker → paste this file → Deploy.
 * For the shared library: Workers KV → create a namespace → Worker Settings → Bindings → add KV binding named TEMPLATES.
 * Optional: Settings → Variables → add secret PUBLISH_KEY to restrict who can publish.
 * Admin panel: add secret ADMIN_KEY (any long random string) and enter it in the app's Admin page.
 */
const ALLOWED_HOST = 'www.nexon.com'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': '*' }
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } })

// ---- leveling-path comparison: every step becomes "<core>@<level>", where <core> is the node's skill-bank
// slot (its type, e.g. m2 / b3 / c1) – or, for a node without one, the slot whose bank name matches its name,
// or a generic label ("Mastery 2" → m2) – so paths compare the same whatever the uploader renamed things to
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const LABEL_SLOT = (n) => {
  const m = n.match(/^(origin|ascent)( skill)?$/); if (m) return m[1] === 'origin' ? 'o1' : 'a1'
  if (n === 'skill 3') return 'k1'
  const x = n.match(/^(mastery|boost) ([1-4])$/); return x ? `${x[1] === 'mastery' ? 'm' : 'b'}${x[2]}` : null
}
async function bankNames(env, classKey) {
  const byName = new Map()
  for (const key of [classKey, 'common']) {
    const b = await env.TEMPLATES.get(`bank:${key}`, 'json').catch(() => null)
    for (const e of b?.entries ?? []) if (!byName.has(norm(e.name))) byName.set(norm(e.name), e.slot)
  }
  return byName
}
function pathSig(tpl, byName) {
  const core = new Map(tpl.nodes.map(n => [n.id, n.slot || byName.get(norm(n.name)) || LABEL_SLOT(norm(n.name)) || `name:${norm(n.name)}`]))
  return tpl.order.map(s => `${core.get(s.nodeId) ?? `id:${s.nodeId}`}@${Number(s.level)}`).join('|')
}
async function findDuplicatePath(env, tpl) {
  if (!tpl.order.length) return null
  const byName = await bankNames(env, tpl.classKey)
  const sig = pathSig(tpl, byName)
  let cursor
  do {
    const list = await env.TEMPLATES.list({ prefix: 'tpl:', cursor })
    for (const k of list.keys) {
      if (k.metadata?.classKey !== tpl.classKey || k.metadata?.steps !== tpl.order.length) continue
      const other = await env.TEMPLATES.get(k.name, 'json').catch(() => null)
      if (other && other.id !== tpl.id && Array.isArray(other.nodes) && Array.isArray(other.order) && pathSig(other, byName) === sig) return other
    }
    cursor = list.list_complete ? undefined : list.cursor
  } while (cursor)
  return null
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const u = new URL(request.url)

    // ---- admin key check ----------------------------------------------------------------------
    const isAdmin = !!env.ADMIN_KEY && request.headers.get('x-admin-key') === env.ADMIN_KEY
    if (u.pathname === '/admin/check') {
      if (!env.ADMIN_KEY) return json({ error: 'ADMIN_KEY is not set on this worker' }, 501)
      return isAdmin ? json({ ok: true }) : json({ error: 'bad admin key' }, 403)
    }

    // ---- skill bank (same KV namespace, "bank:" prefix) -----------------------------------------
    if (u.pathname === '/bank' || u.pathname.startsWith('/bank/')) {
      if (!env.TEMPLATES) return json({ error: 'KV namespace TEMPLATES is not bound on this worker' }, 501)
      const key = decodeURIComponent(u.pathname.split('/')[2] ?? '')
      if (key && !/^[a-z0-9-]{2,40}$/.test(key)) return json({ error: 'bad class key' }, 400)
      if (request.method === 'GET' && !key) {
        const out = []
        let cursor
        do {
          const list = await env.TEMPLATES.list({ prefix: 'bank:', cursor })
          for (const k of list.keys) if (k.metadata) out.push(k.metadata)
          cursor = list.list_complete ? undefined : list.cursor
        } while (cursor)
        return json({ banks: out }, 200)
      }
      if (request.method === 'GET') {
        const v = await env.TEMPLATES.get(`bank:${key}`)
        return v ? new Response(v, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS } }) : json({ error: 'not found' }, 404)
      }
      if (!isAdmin) return json({ error: 'admin only' }, 403)
      if (request.method === 'PUT' && key) {
        let bank
        try { bank = await request.json() } catch { return json({ error: 'bad json' }, 400) }
        if (bank?.classKey !== key || !Array.isArray(bank.entries)) return json({ error: 'missing fields or class mismatch' }, 400)
        const entries = bank.entries.filter(e => e && typeof e.slot === 'string' && typeof e.name === 'string' && typeof e.icon === 'string' && e.icon.startsWith('data:image/'))
          .map(e => ({ slot: e.slot.slice(0, 12), name: e.name.slice(0, 120), primary: !!e.primary, icon: e.icon }))
        const out = { classKey: key, entries, updatedAt: Date.now() }
        const body = JSON.stringify(out)
        if (body.length > 5_000_000) return json({ error: 'bank too large' }, 413)
        await env.TEMPLATES.put(`bank:${key}`, body, { metadata: { classKey: key, count: entries.length, slots: new Set(entries.map(e => e.slot)).size, updatedAt: out.updatedAt } })
        return json({ ok: true, count: entries.length, updatedAt: out.updatedAt })
      }
      if (request.method === 'DELETE' && key) {
        await env.TEMPLATES.delete(`bank:${key}`)
        return json({ ok: true })
      }
      return json({ error: 'method not allowed' }, 405)
    }

    // ---- shared template library ------------------------------------------------------------
    if (u.pathname.startsWith('/templates')) {
      if (!env.TEMPLATES) return json({ error: 'KV namespace TEMPLATES is not bound on this worker' }, 501)
      const id = decodeURIComponent(u.pathname.split('/')[2] ?? '')
      const meta = (tpl) => ({
        id: tpl.id, name: String(tpl.name).slice(0, 80), classKey: String(tpl.classKey ?? ''),
        nodes: tpl.nodes.length, steps: tpl.order.length, source: String(tpl.source ?? '').slice(0, 120), updatedAt: Date.now(),
      })
      const valid = (tpl) => tpl?.id && tpl?.name && Array.isArray(tpl.nodes) && Array.isArray(tpl.order)

      if (request.method === 'GET' && !id) {
        const want = u.searchParams.get('class')
        const out = []
        let cursor
        do {
          const list = await env.TEMPLATES.list({ prefix: 'tpl:', cursor })
          for (const k of list.keys) if (k.metadata && (!want || k.metadata.classKey === want)) out.push(k.metadata)
          cursor = list.list_complete ? undefined : list.cursor
        } while (cursor)
        out.sort((a, b) => (a.classKey || '').localeCompare(b.classKey || '') || a.name.localeCompare(b.name))
        return json({ templates: out })
      }
      if (request.method === 'GET' && id) {
        const t = await env.TEMPLATES.get(`tpl:${id}`)
        return t ? new Response(t, { headers: { 'content-type': 'application/json', ...CORS } }) : json({ error: 'not found' }, 404)
      }
      if (request.method === 'POST') {
        if (env.PUBLISH_KEY && request.headers.get('x-publish-key') !== env.PUBLISH_KEY && !isAdmin) return json({ error: 'bad publish key' }, 403)
        let tpl
        try { tpl = await request.json() } catch { return json({ error: 'bad json' }, 400) }
        if (!valid(tpl)) return json({ error: 'missing fields' }, 400)
        if (!tpl.classKey) return json({ error: 'classKey is required' }, 400)
        const body = JSON.stringify(tpl)
        if (body.length > 2_000_000) return json({ error: 'template too large' }, 413)
        if (await env.TEMPLATES.get(`tpl:${tpl.id}`) && !isAdmin) return json({ error: 'a template with this id exists' }, 409)
        const dup = await findDuplicatePath(env, tpl)
        if (dup) return json({ error: `This leveling path already exists for this class as "${dup.name}".`, duplicate: { id: dup.id, name: dup.name } }, 409)
        await env.TEMPLATES.put(`tpl:${tpl.id}`, body, { metadata: meta(tpl) })
        return json({ ok: true, id: tpl.id })
      }
      if (request.method === 'PUT' && id) {
        if (!isAdmin) return json({ error: 'admin only' }, 403)
        let tpl
        try { tpl = await request.json() } catch { return json({ error: 'bad json' }, 400) }
        if (!valid(tpl) || tpl.id !== id) return json({ error: 'missing fields or id mismatch' }, 400)
        const body = JSON.stringify(tpl)
        if (body.length > 2_000_000) return json({ error: 'template too large' }, 413)
        await env.TEMPLATES.put(`tpl:${id}`, body, { metadata: meta(tpl) })
        return json({ ok: true, id })
      }
      if (request.method === 'DELETE' && id) {
        if (!isAdmin) return json({ error: 'admin only' }, 403)
        await env.TEMPLATES.delete(`tpl:${id}`)
        return json({ ok: true })
      }
      return json({ error: 'method not allowed' }, 405)
    }

    // ---- cross-device sync (same KV namespace, "sync:" prefix) --------------------------------
    if (u.pathname.startsWith('/sync/')) {
      if (!env.TEMPLATES) return json({ error: 'KV namespace TEMPLATES is not bound on this worker' }, 501)
      const key = u.pathname.slice(6)
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return json({ error: 'bad key' }, 400)
      if (request.method === 'GET') {
        const v = await env.TEMPLATES.get(`sync:${key}`)
        return v ? new Response(v, { headers: { 'content-type': 'application/json', ...CORS } }) : json({ error: 'not found' }, 404)
      }
      if (request.method === 'PUT') {
        const body = await request.text()
        if (body.length > 4_000_000) return json({ error: 'snapshot too large' }, 413)
        try { JSON.parse(body) } catch { return json({ error: 'bad json' }, 400) }
        await env.TEMPLATES.put(`sync:${key}`, body)
        return json({ ok: true, bytes: body.length })
      }
      return json({ error: 'method not allowed' }, 405)
    }

    // ---- rankings proxy ------------------------------------------------------------------------
    const target = u.searchParams.get('url')
    if (!target) return json({ error: 'missing ?url=' }, 400)
    let t
    try { t = new URL(target) } catch { return json({ error: 'bad url' }, 400) }
    if (t.hostname !== ALLOWED_HOST) return json({ error: 'host not allowed' }, 403)

    const cache = caches.default
    const cacheKey = new Request(t.toString(), { method: 'GET' })
    let res = await cache.match(cacheKey)
    if (!res) {
      const upstream = await fetch(t.toString(), { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (maple-helper proxy)' } })
      res = new Response(upstream.body, upstream)
      res.headers.set('Cache-Control', 'public, max-age=600')
      if (upstream.ok) await cache.put(cacheKey, res.clone())
    }
    const out = new Response(res.body, res)
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
    return out
  },
}
