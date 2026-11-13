# Nexon rankings proxy (Cloudflare Worker)

The GMS rankings endpoint (`https://www.nexon.com/api/maplestory/no-auth/ranking/v2`) does not send CORS headers,
so the browser can't call it directly. This 30-line Worker forwards the request and adds the headers. Free tier is plenty.

1. `npm i -g wrangler` and `wrangler login`
2. `cd worker && wrangler deploy`
3. Copy the printed URL (e.g. `https://maple-proxy.<you>.workers.dev`) into **Settings → Nexon rankings proxy URL** in the app.

Test: `https://maple-proxy.<you>.workers.dev/?url=https%3A%2F%2Fwww.nexon.com%2Fapi%2Fmaplestory%2Fno-auth%2Franking%2Fv2%3Ftype%3Doverall%26id%3Dweekly%26reboot_index%3D1%26page_index%3D1%26character_name%3DYourIGN`
