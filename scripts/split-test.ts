// full bank-matching flow (confident whole match → split-aware elimination) on a chart: npx tsx scripts/split-test.ts chart.png <classKey>
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect, matchBox, normSignature, shiftedNorm, nccDistMulti } from '../src/lib/chart/detect'
import { colorGrid, coreDistances, MATCH_MAX, MATCH_MARGIN, SPLIT_MAX, SPLIT_MARGIN } from '../src/lib/chart/bankMatch'
import { slotKeyFromLabel } from '../src/data/skillBank'
const [chart, cls] = process.argv.slice(2)
const ROOT = process.env.BANK ?? '/tmp/hs/hexa-skills'
const read = (f: string) => { const png = PNG.sync.read(fs.readFileSync(f)); return { width: png.width, height: png.height, data: png.data } }
const csv = (dir: string, key: string) => fs.readFileSync(`${dir}/skills.csv`, 'utf8').trim().split('\n').slice(1).map(l => { const m = l.match(/^(?:"([^"]*)"|([^,]*)),([^,]*),([^,]*),([^,]*),(.*)$/)!; return { name: m[1] ?? m[2], slot: slotKeyFromLabel(m[4], key)!, icon: m[6], dir } })
const p = read(chart); const d = detect(p)
const rows = [...csv(`${ROOT}/${cls}`, cls), ...csv(`${ROOT}/common`, 'common')]
const ims = rows.map(r => read(`${r.dir}/${r.icon}`))
const full = (im: { width: number; height: number }) => ({ x: 0, y: 0, w: im.width, h: im.height })
const lum = rows.map((r, i) => ({ slot: r.slot, sig: normSignature(ims[i], matchBox(full(ims[i]), d.badges)) }))
const col = rows.map((r, i) => ({ slot: r.slot, grid: colorGrid(ims[i], matchBox(full(ims[i]), d.badges)) }))
const res: Record<number, string> = {}; const claimed = new Set<string>()
for (const [ci, c] of d.clusters.entries()) {
  const sigs = shiftedNorm(p, matchBox(c.rep, d.badges)); const per = new Map<string, number>()
  for (const r of lum) { const x = nccDistMulti(sigs, r.sig); if (x < (per.get(r.slot) ?? 9)) per.set(r.slot, x) }
  const rk = [...per.entries()].sort((a, b) => a[1] - b[1])
  if (rk[0][1] <= MATCH_MAX && rk[1][1] - rk[0][1] >= MATCH_MARGIN) { res[ci] = `${rk[0][0]} ✓ ${rk[0][1].toFixed(2)}`; if (rk[0][0] !== 'stat' && rk[0][1] <= 0.3) claimed.add(rk[0][0]) }
}
const cand = new Set(rows.map(r => r.slot).filter(s => s !== 'stat' && !claimed.has(s)))
for (const [ci, c] of d.clusters.entries()) {
  if (res[ci]) continue
  const ds = coreDistances(p, c.rep, d.badges, col, cand)
  const ok = ds[0] && ds[0].dist <= SPLIT_MAX && (ds[1]?.dist ?? 1) - ds[0].dist >= SPLIT_MARGIN
  res[ci] = `${ok ? ds[0].slot + ' ≈' : '—'} ${ds.slice(0, 3).map(x => `${x.slot} ${x.dist.toFixed(2)}`).join(', ')}`
}
for (const [ci, c] of d.clusters.entries()) console.log(`S${ci} ×${c.members.length}\t${res[ci]}`)
