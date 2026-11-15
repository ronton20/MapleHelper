/**
 * Level-badge digit reader for badge-style charts (pure, no OCR): segment the prepared badge bitmap
 * (dark digits on white, from prepareBadge) into glyphs and match each against digit templates.
 * Game UI fonts are consistent, so this is far more reliable than Tesseract on 6–8px digits.
 */
import type { Bitmap } from './ocrprep'

export const GW = 10, GH = 14

/** binary glyphs (connected ink components) left→right; specks and frame bits are dropped */
export function segmentGlyphs(b: Bitmap): Bitmap[] {
  const { width: W, height: H } = b
  const ink = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) ink[i] = b.gray[i] < 128 ? 1 : 0
  const seen = new Uint8Array(W * H)
  const comps: { px: number[]; x0: number; x1: number; y0: number; y1: number }[] = []
  for (let i = 0; i < W * H; i++) {
    if (!ink[i] || seen[i]) continue
    const st = [i], px: number[] = []; seen[i] = 1
    let x0 = W, x1 = 0, y0 = H, y1 = 0
    while (st.length) {
      const j = st.pop()!; px.push(j); const x = j % W, y = (j / W) | 0
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const k = ny * W + nx; if (ink[k] && !seen[k]) { seen[k] = 1; st.push(k) }
      }
    }
    comps.push({ px, x0, x1, y0, y1 })
  }
  // bits touching the pill's edge are icon / frame remnants, never digits
  const pad = b.pad ?? -10, edge = Math.max(2, Math.round((b.pad ?? 0) / 4 * 1.5))   // 1.5 source px (pad = 4 px × scale)
  const inner = comps.filter(c => !(c.x0 <= pad + edge || c.x1 >= W - pad - 1 - edge || c.y0 <= pad + edge || c.y1 >= H - pad - 1 - edge))
  const pool = b.pad !== undefined ? inner : comps
  if (!pool.length) return []
  // digits are the tall components; keep those at least 60% as tall as the tallest
  const tallest = Math.max(...pool.map(c => c.y1 - c.y0 + 1))
  const glyphs = pool.filter(c => c.y1 - c.y0 + 1 >= tallest * 0.6 && c.px.length > 8).sort((a, b) => a.x0 - b.x0)
  const out: Bitmap[] = []
  for (const c of glyphs) {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1, g = new Uint8Array(w * h).fill(255)
    for (const j of c.px) g[(((j / W) | 0) - c.y0) * w + (j % W) - c.x0] = 0
    // two touching digits ("17", "26") form one wide component: split at the thinnest column near the middle
    if (w > h * 0.95) {
      let best = -1, bi = Infinity
      for (let x = Math.round(w * 0.3); x <= Math.round(w * 0.7); x++) { let n = 0; for (let y = 0; y < h; y++) if (g[y * w + x] < 128) n++; if (n < bi) { bi = n; best = x } }
      const part = (xa: number, xb: number) => { const pw = xb - xa, pg = new Uint8Array(pw * h); for (let y = 0; y < h; y++) for (let x = 0; x < pw; x++) pg[y * pw + x] = g[y * w + xa + x]; return trim({ width: pw, height: h, gray: pg }) }
      out.push(part(0, best), part(best + 1, w))
    } else out.push({ width: w, height: h, gray: g })
  }
  return out
}

/** crop a glyph bitmap to its ink */
function trim(b: Bitmap): Bitmap {
  let x0 = b.width, x1 = -1, y0 = b.height, y1 = -1
  for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (b.gray[y * b.width + x] < 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return b
  const w = x1 - x0 + 1, h = y1 - y0 + 1, g = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = b.gray[(y + y0) * b.width + x + x0]
  return { width: w, height: h, gray: g }
}

/** glyph → GW×GH ink grid scaled by height (keeps the narrow "1" narrow), centred horizontally */
export function normGlyph(g: Bitmap): Float32Array {
  const out = new Float32Array(GW * GH)
  const s = GH / g.height, w = g.width * s, ox = (GW - w) / 2
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const sx0 = (x - ox) / s, sx1 = (x + 1 - ox) / s, sy0 = y / s, sy1 = (y + 1) / s
    let ink = 0, n = 0
    for (let yy = Math.floor(sy0); yy < Math.ceil(sy1); yy++) for (let xx = Math.floor(sx0); xx < Math.ceil(sx1); xx++) {
      n++; if (xx >= 0 && yy >= 0 && xx < g.width && yy < g.height && g.gray[yy * g.width + xx] < 128) ink++
    }
    out[y * GW + x] = n ? ink / n : 0
  }
  return out
}

export function glyphDist(a: Float32Array, b: Float32Array) { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length }

/** templates: GW×GH ink-density grids, one char per cell ('0' = empty … '9' = full), built by scripts/make-digit-templates.ts */
export const DIGIT_TEMPLATES: Record<string, string> = {
  '0': '0147987520 0489999861 3898557994 7995224896 9983001698 9972000599 9961000499 9961000499 9972000499 9983001698 7995114896 4898568984 1589999851 0268998520',   // 19 samples
  '1': '0012466200 0036899500 0179999710 0069999810 0013789810 0001489810 0000479810 0000379810 0000379810 0000379810 0000379810 0000379810 0000379710 0000257400',   // 62 samples
  '2': '0147897420 1589999851 3898667983 4874236895 1320015895 0000016994 0000048972 0000389830 0003797300 0037994100 0379972000 2699984210 4999999962 3799999863',   // 36 samples
  '3': '0257986310 1589999831 4887558973 4753126984 0000017983 0000148972 0003799951 0003799961 0000147995 0000015897 3542016997 5885348995 3799999962 1479998630',   // 24 samples
  '4': '0000157710 0000489930 0001799940 0005999941 0049999941 0179999941 1599659941 4899438951 7999559973 8999889996 8999999999 5999999998 0111259973 0000005731',   // 19 samples
  '5': '1489999731 4799999831 5798755310 5898631000 6999874100 7999998510 7999999962 4777789984 0000015897 0000004798 2421005897 4875237994 3799999952 1478988631',   // 17 samples
  '6': '0026898420 0268999851 2698778984 4898657894 6998557961 7999889940 8999999982 8998657996 8985002798 7983001698 6995002797 3898436895 0489999862 0146897531',   // 22 samples
  '7': '2699999972 3899999994 3555679995 1233469994 0000159972 0000169941 0000389710 0001698400 0004896200 0016994100 0038961000 0169830000 0399610000 0277300000',   // 19 samples
  '8': '0147996300 1489999730 3898779972 5986348983 5984007983 4897458971 2799999950 3899999961 6987558995 7972005897 8962005897 6985238996 3789889862 1457986420',   // 16 samples
  '9': '0147997310 1589999741 5898678982 8985235894 8972001797 8972002898 7996237998 3898789998 1477679997 0233236996 2553016994 4897358982 1699999840 0257987300',   // 19 samples
}

const parsed = () => Object.entries(DIGIT_TEMPLATES).map(([d, t]) => [d, Float32Array.from(t.replace(/\s/g, ''), ch => Number(ch) / 9)] as const)

/** read a badge bitmap; conf = 1 − worst glyph distance relative to the runner-up */
export function readBadgeDigits(b: Bitmap): { text: string; conf: number } {
  const T = parsed(); if (!T.length) return { text: '', conf: 0 }
  const gl = segmentGlyphs(b)
  if (!gl.length || gl.length > 2) return { text: '', conf: 0 }
  let text = '', conf = 1
  for (const g of gl) {
    const v = normGlyph(g)
    const ds = T.map(([d, t]) => [d, glyphDist(v, t)] as const).sort((a, c) => a[1] - c[1])
    const [best, second] = ds
    text += best[0]
    conf = Math.min(conf, best[1] > 0.22 ? 0 : Math.max(0, Math.min(1, (second[1] - best[1]) / Math.max(0.02, second[1]))))
  }
  return { text, conf }
}
