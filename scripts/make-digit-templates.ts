// builds DIGIT_TEMPLATES from a badge chart with known levels: npx tsx scripts/make-digit-templates.ts chart.png
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect } from '../src/lib/chart/detect'
import { prepareBadge } from '../src/lib/chart/ocrprep'
import { segmentGlyphs, normGlyph, GW, GH } from '../src/lib/chart/badgeDigits'
import { LETHE_TRUTH } from './lethe-truth'
const truth: Record<number, number> = {}
LETHE_TRUTH.forEach((v, i) => truth[i] = v)
const png = PNG.sync.read(fs.readFileSync(process.argv[2])); const p = { width: png.width, height: png.height, data: png.data }
const d = detect(p)
const acc: Record<string, Float32Array[]> = {}
for (const [i, v] of Object.entries(truth)) {
  const t = d.seq[Number(i)]
  const gl = segmentGlyphs(prepareBadge(p, { x: t.x + t.w * 0.42, y: t.y + t.h * 0.55, w: t.w * 0.85, h: t.h * 0.62 }, 6))
  const digits = String(v)
  if (gl.length !== digits.length) { console.error(`tile ${i}: ${gl.length} glyphs for "${digits}"`); continue }
  gl.forEach((g, k) => (acc[digits[k]] ??= []).push(normGlyph(g)))
}
const out: string[] = []
for (const dgt of Object.keys(acc).sort()) {
  const avg = new Float32Array(GW * GH); for (const a of acc[dgt]) for (let j = 0; j < a.length; j++) avg[j] += a[j] / acc[dgt].length
  const rows: string[] = []; for (let y = 0; y < GH; y++) rows.push(Array.from(avg.slice(y * GW, y * GW + GW), v => String(Math.min(9, Math.round(v * 9)))).join(''))
  out.push(`  '${dgt}': '${rows.join(' ')}',   // ${acc[dgt].length} samples`)
}
console.log(out.join('\n'))
