// match a chart's clusters against the skill bank folder: npx tsx scripts/bank-check.ts chart.png <classKey>
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect, matchBox, normSignature, nccDistMulti } from '../src/lib/chart/detect'
const [chart, cls] = process.argv.slice(2)
const ROOT = process.env.BANK ?? '/tmp/hs/hexa-skills'
const read = (f: string) => { const png = PNG.sync.read(fs.readFileSync(f)); return { width: png.width, height: png.height, data: png.data } }
const csv = (dir: string) => fs.readFileSync(`${dir}/skills.csv`, 'utf8').trim().split('\n').slice(1).map(l => { const m = l.match(/^(?:"([^"]*)"|([^,]*)),([^,]*),([^,]*),([^,]*),(.*)$/)!; return { name: m[1] ?? m[2], type: m[3], slot: m[4], primary: m[5] === '1', icon: m[6], dir } })
const p = read(chart); const d = detect(p)
const rows = [...csv(`${ROOT}/${cls}`), ...csv(`${ROOT}/common`)]
const cat = rows.map(r => { const im = read(`${r.dir}/${r.icon}`); return { ...r, sig: normSignature(im, matchBox({ x: 0, y: 0, w: im.width, h: im.height }, d.badges)) } })
console.log(`badges=${d.badges} clusters=${d.clusters.length}`)
for (const [ci, c] of d.clusters.entries()) {
  const best = cat.map(r => ({ r, dist: nccDistMulti(c.rep.nsigs, r.sig) })).sort((a, b) => a.dist - b.dist)
  const b2 = best.find(x => x.r.slot !== best[0].r.slot)!
  console.log(`S${ci} ×${c.members.length}\t${best[0].dist.toFixed(3)} ${best[0].r.slot} (${best[0].r.name})\t| next slot ${b2.dist.toFixed(3)} ${b2.r.slot}`)
}
