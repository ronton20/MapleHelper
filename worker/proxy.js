/**
 * Cloudflare Worker for Maple Helper:
 *   GET  /?url=<nexon rankings url>     CORS proxy for the GMS rankings JSON (only www.nexon.com is allowed)
 *   GET  /templates                     list shared HEXA class templates          (needs KV binding "TEMPLATES")
 *   GET  /templates/:id                 one template
 *   POST /templates                     publish a template (JSON body; optional PUBLISH_KEY secret → x-publish-key header)
 *
 * Deploy (free):  Workers & Pages → Create Worker → paste this file → Deploy.
 * For the shared library: Workers KV → create a namespace → Worker Settings → Bindings → add KV binding named TEMPLATES.
 * Optional: Settings → Variables → add secret PUBLISH_KEY to restrict who can publish.
 */
const ALLOWED_HOST = 'www.nexon.com'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': '*' }
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } })

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
    const u = new URL(request.url)

    // ---- shared template library ------------------------------------------------------------
    if (u.pathname.startsWith('/templates')) {
      if (!env.TEMPLATES) return json({ error: 'KV namespace TEMPLATES is not bound on this worker' }, 501)
      const id = u.pathname.split('/')[2]
      if (request.method === 'GET' && !id) {
        const list = await env.TEMPLATES.list({ prefix: 'tpl:' })
        const templates = list.keys.map(k => k.metadata).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
        return json({ templates })
      }
      if (request.method === 'GET' && id) {
        const t = await env.TEMPLATES.get(`tpl:${id}`)
        return t ? new Response(t, { headers: { 'content-type': 'application/json', ...CORS } }) : json({ error: 'not found' }, 404)
      }
      if (request.method === 'POST') {
        if (env.PUBLISH_KEY && request.headers.get('x-publish-key') !== env.PUBLISH_KEY) return json({ error: 'bad publish key' }, 403)
        let tpl
        try { tpl = await request.json() } catch { return json({ error: 'bad json' }, 400) }
        if (!tpl?.id || !tpl?.name || !Array.isArray(tpl.nodes) || !Array.isArray(tpl.order)) return json({ error: 'missing fields' }, 400)
        const body = JSON.stringify(tpl)
        if (body.length > 2_000_000) return json({ error: 'template too large' }, 413)
        const meta = { id: tpl.id, name: String(tpl.name).slice(0, 60), nodes: tpl.nodes.length, steps: tpl.order.length, source: String(tpl.source ?? '').slice(0, 120), updatedAt: Date.now() }
        await env.TEMPLATES.put(`tpl:${tpl.id}`, body, { metadata: meta })
        return json({ ok: true, id: tpl.id })
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
