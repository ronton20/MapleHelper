// emulate linkNodesToBank on 64px crops of a chart's clusters: npx tsx scripts/link-test.ts chart.png <classKey>
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect, matchBox, normSignature, shiftedNorm, nccDistMulti } from '../src/lib/chart/detect'
const [chart, cls] = process.argv.slice(2)
const ROOT = process.env.BANK ?? '/tmp/hs/hexa-skills'
const read = (f: string) => { const png = PNG.sync.read(fs.readFileSync(f)); return { width: png.width, height: png.height, data: png.data } }
const csv = (dir: string) => fs.readFileSync(`${dir}/skills.csv`, 'utf8').trim().split('\n').slice(1).map(l => { const m = l.match(/^(?:"([^"]*)"|([^,]*)),([^,]*),([^,]*),([^,]*),(.*)$/)!; return { name: m[1] ?? m[2], slot: m[4], icon: m[6], dir } })
const p = read(chart); const d = detect(p)
const rows = [...csv(`${ROOT}/${cls}`), ...csv(`${ROOT}/common`)].filter(r => r.slot !== 'HEXA Stat')
const ims = rows.map(r => read(`${r.dir}/${r.icon}`))
const refs = (b: boolean) => rows.map((r, i) => ({ slot: r.slot, sig: normSignature(ims[i], matchBox({ x: 0, y: 0, w: ims[i].width, h: ims[i].height }, b)) }))
const R = { f: refs(false), t: refs(true) }
// 64px nearest-neighbour crop like cropDataUrl
const crop = (b: { x: number; y: number; w: number; h: number }) => { const o = new Uint8Array(64 * 64 * 4); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const sx = Math.floor(b.x + x * b.w / 64), sy = Math.floor(b.y + y * b.h / 64); const si = (sy * p.width + sx) * 4, di = (y * 64 + x) * 4; for (let k = 0; k < 4; k++) o[di + k] = p.data[si + k] } return { width: 64, height: 64, data: o } }
const modes = { false: [] as any[], true: [] as any[] }
for (const [ci, c] of d.clusters.entries()) {
  const im = crop(c.rep)
  for (const [b, rs] of [[false, R.f], [true, R.t]] as const) {
    const sigs = shiftedNorm(im, matchBox({ x: 2, y: 2, w: 60, h: 60 }, b)); const per = new Map<string, number>()
    for (const r of rs) { const dd = nccDistMulti(sigs, r.sig); if (dd < (per.get(r.slot) ?? 9)) per.set(r.slot, dd) }
    const rk = [...per.entries()].sort((a, c2) => a[1] - c2[1]); const hit = { b, slot: rk[0][0], dist: rk[0][1], margin: rk[1][1] - rk[0][1] }
    modes[String(b) as 'false' | 'true'].push({ ci, n: c.members.length, ...hit })
  }
}
const score = (hs: any[]) => new Set(hs.filter(h => h.dist <= 0.63 && h.margin >= 0.05).map(h => h.slot)).size - hs.reduce((a, h) => a + h.dist, 0) / hs.length
const mode = score(modes.true) > score(modes.false) ? 'true' : 'false'
console.log('mode badges=', mode)
for (const h of modes[mode]) console.log(`S${h.ci} ×${h.n}\t${h.dist.toFixed(3)} m${h.margin.toFixed(2)} ${h.slot} ${h.dist <= 0.63 && h.margin >= 0.05 ? 'OK' : '--'}`)
