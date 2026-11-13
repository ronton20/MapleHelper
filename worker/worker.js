/**
 * Cloudflare Worker: tiny CORS proxy for the Nexon GMS rankings JSON endpoint.
 * Deploy: npm i -g wrangler && wrangler deploy  (see worker/README.md)
 */
const ALLOWED_HOSTS = ['www.nexon.com']

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors })

    const target = new URL(request.url).searchParams.get('url')
    if (!target) return new Response('missing ?url=', { status: 400, headers: cors })
    let u
    try { u = new URL(target) } catch { return new Response('bad url', { status: 400, headers: cors }) }
    if (!ALLOWED_HOSTS.includes(u.hostname)) return new Response('host not allowed', { status: 403, headers: cors })

    const upstream = await fetch(u.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (maple-helper)', 'Accept': 'application/json' },
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json', 'Cache-Control': 'public, max-age=300' },
    })
  },
}
