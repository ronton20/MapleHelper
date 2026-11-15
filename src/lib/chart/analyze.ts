/**
 * Chart importer orchestration: detection (pure) + OCR (injected) → skills + ordered steps.
 * Platform-agnostic: the caller supplies `ocr(box, scale)` which returns words with bboxes in
 * *original image* coordinates.
 */
import { detect, normSignature, nccDist, type Pixels, type Box, type Detection, type SeqTile } from './detect'
import type { HexaNodeType } from '../../types'
import { prepareBadge } from './ocrprep'
import { readBadgeDigits } from './badgeDigits'

export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number; conf: number }
export type OcrFn = (box: Box, mode: 'line' | 'block' | 'word' | 'wordgray' | 'badge', digitsOnly: boolean, dropSideEdges?: boolean) => Promise<OcrWord[]>

export interface ChartSkill {
  id: string                 // S0, S1 …
  name: string               // best guess (may be '')
  nameSource: 'legend' | 'label' | 'none'
  type: HexaNodeType | null  // best guess
  group: 'skill' | 'mastery' | 'boost' | 'common' | 'stat' | null
  iconBox: Box               // crop in original image (representative tile)
  legendBox: Box | null
  count: number
  clusterIdx: number
}
export interface ChartStep {
  index: number
  skillId: string
  level: number | null
  labelText: string
  tile: Box
  confidence: number         // 0..1
}
export interface ChartAnalysis {
  tileSize: number
  skills: ChartSkill[]
  steps: ChartStep[]
  warnings: string[]
  detection: Detection
  headers?: string[]
}

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0 }

/** a reference icon (whole-tile image) with the name/type it implies */
export interface RefIcon { name: string; type: HexaNodeType; pixels: Pixels }

export async function analyzeChart(p: Pixels, ocr: OcrFn, progress?: (msg: string, frac: number) => void, refIcons: RefIcon[] = []): Promise<ChartAnalysis> {
  progress?.('Finding icon tiles…', 0.05)
  const d = detect(p)
  const warnings: string[] = []
  if (!d.seq.length) return { tileSize: 0, skills: [], steps: [], warnings: ['No icon grid found in this image.'], detection: d }
  const T = d.tileSize

  // ---- labels under each sequence tile -------------------------------------------------------
  // Pass 1: one OCR per row band (good for text labels like "Overdrive - 1" / "HEXA Stat").
  // Pass 2: per-tile OCR for tiles whose band text has no real word (lone digits are unreliable in a band).
  const labels = new Map<number, string>()   // tile index -> text
  const lowConf = new Set<number>()           // tiles whose two OCR passes disagreed
  const rowTops = d.rows.map(r => Math.min(...r.map(t => t.y)))
  const total = d.seq.length; let done = 0
  if (d.badges) {
    // badge-style chart: each tile shows its level in a pill at the icon's bottom-right corner
    for (const t of d.seq) {
      done++
      if (done % 8 === 0) progress?.(`Reading levels (${done}/${total})…`, 0.1 + 0.55 * done / total)
      const box: Box = { x: t.x + t.w * 0.42, y: t.y + t.h * 0.55, w: t.w * 0.85, h: t.h * 0.62 }
      const valid = (x: string) => /^\d{1,2}$/.test(x) && Number(x) >= 1 && Number(x) <= 30
      // digit templates first (reliable for the game font); Tesseract only when they don't match
      const tm = readBadgeDigits(prepareBadge(p, box, 6))
      let txt = valid(tm.text) ? tm.text : ''
      if (txt) { if (tm.conf < 0.35) lowConf.add(t.index) }
      else {
        const ws = await ocr(box, 'badge', true)
        const o = ws.map(w => w.text).join('').replace(/\D/g, '')
        if (valid(o)) { txt = o; lowConf.add(t.index) }
      }
      labels.set(t.index, txt)
    }
  }
  for (let ri = 0; !d.badges && ri < d.rows.length; ri++) {
    const row = d.rows[ri]
    const bottom = Math.max(...row.map(t => t.y + t.h))
    const next = ri + 1 < d.rows.length ? rowTops[ri + 1] : p.height
    const y0 = bottom + 1, y1 = Math.min(next - 2, bottom + Math.round(T * 0.8))
    const pitch = row.length > 1 ? median(row.slice(1).map((t, i) => t.cx - row[i].cx)) : T * 1.5
    if (y1 - y0 < 6) { for (const t of row) labels.set(t.index, ''); done += row.length; continue }
    progress?.(`Reading labels (row ${ri + 1}/${d.rows.length})…`, 0.1 + 0.55 * done / total)
    const x0 = Math.max(0, row[0].x - T), x1 = Math.min(p.width, row[row.length - 1].x + row[row.length - 1].w + T)
    const bandWords = await ocr({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 'block', false)
    for (const t of row) {
      done++
      const ws = bandWords.filter(w => Math.abs((w.x0 + w.x1) / 2 - t.cx) < pitch * 0.42 && w.text.trim())
        .sort((a, b) => (a.y0 - b.y0 > 4 ? 1 : b.y0 - a.y0 > 4 ? -1 : a.x0 - b.x0))
      // group into text lines; keep the first line, plus a tightly-stacked short second line ("HEXA" / "Stat")
      const lines: OcrWord[][] = []
      for (const w of ws) { const last = lines[lines.length - 1]; if (last && Math.abs(last[0].y0 - w.y0) <= 4) last.push(w); else lines.push([w]) }
      let txt = lines[0]?.map(w => w.text).join(' ') ?? ''
      if (lines[1]) {
        const l1 = lines[0], l2 = lines[1]
        const h1 = Math.max(...l1.map(w => w.y1)) - Math.min(...l1.map(w => w.y0))
        const gap = Math.min(...l2.map(w => w.y0)) - Math.max(...l1.map(w => w.y1))
        const t2 = l2.map(w => w.text).join(' ')
        if (!/\d/.test(txt) && gap < h1 * 0.7 && /^[a-z]{2,6}$/i.test(t2)) txt += ' ' + t2
      }
      txt = txt.replace(/\s+/g, ' ').trim()
      // accept band text when it looks like a real label: "Name - 12", "M1-5", "HEXA Stat", "free"
      const plausible = /^[a-z][a-z0-9 .'/]*?[\s\-–:]*\d{1,2}$/i.test(txt) || /^[a-z]{3,}(\s[a-z]{2,})*$/i.test(txt) || /^free$/i.test(txt)
      if (plausible) { labels.set(t.index, txt); continue }
      progress?.(`Reading labels (${done}/${total})…`, 0.1 + 0.55 * done / total)
      const lb: Box = { x: Math.round(t.cx - pitch * 0.45), y: y0, w: Math.round(pitch * 0.9), h: y1 - y0 }
      // three passes (different segmentation / binarisation) and a vote – digits are easy to misread (1↔4, 29↔23)
      const lw = await ocr(lb, 'line', false, true); const dw = await ocr(lb, 'word', true, true); const gw = await ocr(lb, 'wordgray', true, true)
      const ltxt = lw.map(w => w.text).join(' ').replace(/\s+/g, ' ').trim()
      const nums: [string, number][] = ([
        [(ltxt.match(/^\D*(\d{1,2})\D*$/) ?? [])[1] ?? '', 2],
        [(dw.map(w => w.text).join('').trim().match(/^\d{1,2}$/) ?? [])[0] ?? '', 1],
        [(gw.map(w => w.text).join('').trim().match(/^\d{1,2}$/) ?? [])[0] ?? '', 1],
      ] as [string, number][]).filter(x => x[0])
      const l2 = (ltxt.match(/[a-z]/gi) ?? []).length
      if (nums.length) {
        // the line pass is the most reliable → counts double; flag when it is contradicted by both others or absent
        const counts = new Map<string, number>(); nums.forEach(([n, wgt]) => counts.set(n, (counts.get(n) ?? 0) + wgt))
        const [bestNum, votes] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
        txt = bestNum
        if (counts.size > 1 && votes <= 2) lowConf.add(t.index)
      } else if (/free/i.test(ltxt) || l2 >= 3) txt = ltxt
      else txt = ''
      labels.set(t.index, txt)
    }
  }

  // ---- a "legend row": first row whose labels are names rather than levels (Hero-style charts) -------
  const legendRowNames = new Map<number, string>()   // cluster -> name
  const legendRowTiles = new Set<number>()           // tile indices to drop from the sequence
  if (!d.legend.length && d.rows.length > 1) {
    const row = d.rows[0]
    const nameLike = row.filter(t => { const l = labels.get(t.index) ?? ''; return /[a-z]{2,}/i.test(l) && !/free/i.test(l) && !/^\d/.test(l) })
    const keyword = nameLike.some(t => /origin|ascent|^m\s?\d|hexa|common|mastery|boost/i.test(labels.get(t.index) ?? ''))
    if (nameLike.length >= Math.max(3, row.length * 0.6) || (nameLike.length >= 3 && keyword)) {
      for (const t of row) { legendRowTiles.add(t.index); const l = (labels.get(t.index) ?? '').replace(/\s*[-–:]\s*\d{1,2}$/, '').trim(); if (l && !legendRowNames.has(t.cluster)) legendRowNames.set(t.cluster, cleanName(l)) }
      warnings.push('First row read as a legend (names) and excluded from the steps.')
    }
  }

  // ---- legend names + headers ------------------------------------------------------------------
  const legendNames: string[] = []
  const headersOut: string[] = []
  const legendGroups: (ChartSkill['group'] | null)[] = []
  if (d.legend.length && d.legendBox) {
    progress?.('Reading legend…', 0.65)
    const lb = d.legendBox
    const firstRowTop = rowTops[0]
    const nameBand: Box = { x: Math.max(0, lb.x - T), y: lb.y + lb.h, w: Math.min(p.width, lb.x + lb.w + T) - Math.max(0, lb.x - T), h: Math.max(8, Math.min(firstRowTop - 4, lb.y + lb.h + Math.round(T * 2.2)) - (lb.y + lb.h)) }
    const words = nameBand.h > 8 ? await ocr(nameBand, 'block', false) : []
    const centers = d.legend.map(l => l.box.x + l.box.w / 2)
    const lpitch = centers.length > 1 ? median(centers.slice(1).map((c, i) => c - centers[i])) : T * 2
    d.legend.forEach((l, li) => {
      const cx = centers[li]
      const ws = words.filter(w => Math.abs((w.x0 + w.x1) / 2 - cx) < Math.max(l.box.w * 0.8, lpitch * 0.48) && w.text.trim())
        .sort((a, b) => (a.y0 - b.y0 > 4 ? 1 : b.y0 - a.y0 > 4 ? -1 : a.x0 - b.x0))
      // stop at a line that looks like a footnote ("Icon changes at level 20")
      const lines: OcrWord[][] = []
      for (const w of ws) { const last = lines[lines.length - 1]; if (last && Math.abs(last[0].y0 - w.y0) <= 4) last.push(w); else lines.push([w]) }
      const kept: string[] = []
      for (const ln of lines) { const txt = ln.map(w => w.text).join(' '); if (kept.length && /^(icon|changes|level|lvl|\()/i.test(txt)) break; kept.push(txt) }
      legendNames[li] = cleanName(kept.join(' '))
    })
    // headers above the legend
    const hb: Box = { x: 0, y: Math.max(0, lb.y - Math.round(T * 1.1)), w: p.width, h: Math.round(T * 1.1) - 2 }
    const hw = (await ocr(hb, 'block', false)).filter(w => /[a-z]{3,}/i.test(w.text))
    // header spans: a keyword word (skill/mastery/enhancement/boost/common/stat) plus a following "Nodes"/"Stats"
    hw.sort((a, b) => a.x0 - b.x0)
    const phrases: { text: string; x0: number; x1: number; group: ChartSkill['group'] }[] = []
    hw.forEach((w, i) => {
      const g = groupFromText(w.text); if (!g) return
      const next = hw[i + 1]
      const span = next && /^(nodes?|stats?|cores?|skills?)$/i.test(next.text) && next.x0 - w.x1 < (w.y1 - w.y0) * 2 ? next.x1 : w.x1
      phrases.push({ text: w.text + (span !== w.x1 ? ' ' + next.text : ''), x0: w.x0, x1: span, group: g })
    })
    headersOut.push(...phrases.map(q => `${q.text}@${Math.round(q.x0)}-${Math.round(q.x1)}`))
    if (phrases.length) d.legend.forEach((_, li) => {
      const cx = centers[li]
      // nearest span by edge distance (0 when inside)
      let best = phrases[0], bd = Infinity
      for (const q of phrases) { const dd = cx < q.x0 ? q.x0 - cx : cx > q.x1 ? cx - q.x1 : 0; if (dd < bd) { bd = dd; best = q } }
      legendGroups[li] = bd < lpitch * 3 ? best.group : null
    })
  }

  // ---- build skills from clusters ---------------------------------------------------------------
  progress?.('Assembling skills…', 0.85)
  const remapRef = new Map<string, string>()
  const skills: ChartSkill[] = d.clusters.map((c, ci) => {
    const li = c.legendIdx
    let name = li >= 0 && legendNames[li] ? legendNames[li] : (legendRowNames.get(ci) ?? '')
    let nameSource: ChartSkill['nameSource'] = name ? 'legend' : 'none'
    if (!name) {
      // most common non-numeric label text among members
      const counts = new Map<string, number>()
      for (const m of c.members) {
        const raw = labels.get(m.index) ?? ''
        const sm = raw.match(/stat\s*(\d|i{1,3})?\s*$/i)
        const n = sm ? `HEXA Stat ${sm[1] ? sm[1].toUpperCase().replace(/^1$/, 'I').replace(/^2$/, 'II').replace(/^3$/, 'III') : ''}`.trim() : labelName(raw)
        if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) { name = top[0]; nameSource = 'label' }
    }
    const group = (li >= 0 && legendGroups[li]) || groupFromText(name) || null
    const count = c.members.filter(m => !legendRowTiles.has(m.index)).length
    return { id: `S${ci}`, name, nameSource, type: null, group, iconBox: { x: c.rep.x, y: c.rep.y, w: c.rep.w, h: c.rep.h }, legendBox: li >= 0 ? d.legend[li].box : null, count, clusterIdx: ci }
  })

  // known icons (HEXA Stat I-III, Sol Hecate …): name clusters whose icon matches a reference
  const refSigs = refIcons.map(r => ({ r, sig: normSignature(r.pixels, { x: 0, y: 0, w: r.pixels.width, h: r.pixels.height }) }))
  for (const sk of skills) {
    const rep = d.clusters[sk.clusterIdx].rep
    let best: typeof refSigs[number] | null = null, bd = Infinity
    for (const rs of refSigs) { const dd = Math.min(...rep.nsigs.map(n => nccDist(n, rs.sig))); if (dd < bd) { bd = dd; best = rs } }
    if (best && bd < 0.35) { sk.name = best.r.name; sk.nameSource = 'legend'; sk.type = best.r.type; sk.group = best.r.type === 'stat' ? 'stat' : best.r.type === 'common' || best.r.type === 'commonBoost' ? 'common' : sk.group }
  }
  // Sol Hecate's icon changes with level → several clusters may now carry the same reference name: merge them
  const byRef = new Map<string, ChartSkill>()
  for (const sk of skills) { if (sk.nameSource !== 'legend' || !refSigs.some(r => r.r.name === sk.name) || sk.type === 'stat') continue; const e = byRef.get(sk.name); if (e) { e.count += sk.count; remapRef.set(sk.id, e.id) } else byRef.set(sk.name, sk) }

  // merge clusters that share a label-derived name (e.g. Hecate icon variants labelled "Hecate")
  const byName = new Map<string, ChartSkill>()
  const remap = new Map<string, string>(remapRef)
  for (const s of skills) {
    if (remap.has(s.id)) continue
    const key = s.nameSource === 'label' ? s.name.toLowerCase() : ''
    if (!key) continue
    const e = byName.get(key)
    if (e) { e.count += s.count; remap.set(s.id, e.id) } else byName.set(key, s)
  }
  const mergedSkills = skills.filter(s => !remap.has(s.id))

  // types: group → type (skill group: first-seen = origin, next = ascent, then 3rd skill)
  const firstSeen = new Map<string, number>()
  for (const t of d.seq) { if (legendRowTiles.has(t.index)) continue; const sid = remap.get(`S${t.cluster}`) ?? `S${t.cluster}`; if (!firstSeen.has(sid)) firstSeen.set(sid, t.index) }
  const ordered = [...mergedSkills].sort((a, b) => (firstSeen.get(a.id) ?? 1e9) - (firstSeen.get(b.id) ?? 1e9))
  let skillN = 0, statN = 0
  // GMS naming: mastery cores are "HEXA <skill>"; a "skill"-group entry with that prefix is a misread header span
  for (const s of ordered) if (s.group === 'skill' && /^hexa\s/i.test(s.name)) s.group = 'mastery'
  for (const s of ordered) {
    const n = s.name.toLowerCase()
    if (/\bstat/.test(n) || s.group === 'stat') { s.group = 'stat'; s.type = 'stat'; statN++; const m = n.match(/^hexa stat\s*(i{1,3}|[123])$/); s.name = m ? `HEXA Stat ${m[1].toUpperCase()}` : `HEXA Stat ${['I', 'II', 'III'][statN - 1] ?? statN}` }
    else if (/origin/.test(n)) { s.group = 'skill'; s.type = 'origin' }
    else if (/ascent/.test(n)) { s.group = 'skill'; s.type = 'ascent' }
    else if (/janus|hecate/.test(n)) { s.group = 'common'; s.type = 'common' }
    else if (s.group === 'skill') { s.type = (['origin', 'ascent', 'skill3'] as HexaNodeType[])[Math.min(2, skillN++)] }
    else if (s.group === 'mastery') s.type = 'mastery'
    else if (s.group === 'boost') s.type = 'boost'
    else if (s.group === 'common') { s.type = /^sol\s|janus|hecate/.test(n) ? 'common' : 'commonBoost' }
    else if (/^m\s?\d/.test(n)) { s.group = 'mastery'; s.type = 'mastery' }
    else if (/^c\s?[12]\b/.test(n)) { s.group = 'common'; s.type = 'common'; if (/^c\s?1/.test(n)) s.name = 'Sol Janus'; if (/^c\s?2/.test(n)) s.name = 'Sol Hecate' }
    else if (/^c\s?3\b/.test(n)) { s.group = 'common'; s.type = 'commonBoost' }
    else if (/^hexa[\s-]*[123]\b/.test(n)) { s.group = 'stat'; s.type = 'stat'; statN++; s.name = `HEXA Stat ${['I', 'II', 'III'][statN - 1] ?? statN}` }
    else if (s.type === null && firstSeen.get(s.id) === Math.min(...firstSeen.values()) && d.seq.length > 0) { s.group = 'skill'; s.type = 'origin'; skillN = 1 }
  }
  // still untyped: the in-game layout has 4 masteries and 4 boosts – fill whichever is short
  const typed = (t: HexaNodeType) => ordered.filter(x => x.type === t).length
  for (const s of ordered) {
    if (s.type) continue
    if (typed('ascent') === 0 && typed('origin') > 0 && /ascent/.test(s.name.toLowerCase())) { s.type = 'ascent'; s.group = 'skill'; continue }
    if (typed('mastery') < 4) { s.type = 'mastery'; s.group = 'mastery' } else if (typed('boost') < 4) { s.type = 'boost'; s.group = 'boost' } else { s.type = 'boost'; s.group = 'boost' }
    s.nameSource = s.nameSource  // keep
  }
  if (!d.legend.length && !legendRowNames.size) warnings.push('No legend found – skill names/types are guessed; please check them.')

  // ---- steps ---------------------------------------------------------------------------------------
  const steps: ChartStep[] = d.seq.filter(t => !legendRowTiles.has(t.index)).map(t => {
    const txt = labels.get(t.index) ?? ''
    const sid = remap.get(`S${t.cluster}`) ?? `S${t.cluster}`
    const skill = mergedSkills.find(s => s.id === sid)!
    const statLabel = /stat\s*(\d|i{1,3})?$/i.test(txt.trim())
    let level: number | null = statLabel ? null : parseLevel(txt)
    let conf = level !== null ? (lowConf.has(t.index) ? 0.45 : 1) : 0
    if (level === null && /free/i.test(txt)) { level = 1; conf = 0.9 }
    if (level === null && skill.type === 'stat') { level = 20; conf = 0.5 }
    return { index: t.index, skillId: sid, level, labelText: txt, tile: { x: t.x, y: t.y, w: t.w, h: t.h }, confidence: conf }
  })
  // sanity: levels should be non-decreasing per skill; flag drops, and suggest a value for an
  // unreadable step that sits exactly between two known neighbours (prev+1 == next-1)
  const bySkill = new Map<string, ChartStep[]>()
  for (const st of steps) { const arr = bySkill.get(st.skillId) ?? []; arr.push(st); bySkill.set(st.skillId, arr) }
  for (const arr of bySkill.values()) {
    for (let i = 0; i < arr.length; i++) {
      const st = arr[i]
      if (st.level !== null) continue
      const prev = i > 0 ? arr[i - 1].level : (arr[i - 1] === undefined ? 0 : null)
      const next = i + 1 < arr.length ? arr[i + 1].level : null
      if (prev !== null && next !== null && next - prev === 2) { st.level = prev + 1; st.confidence = 0.4 }
      else if (prev !== null && next === null && i === arr.length - 1 && prev === 29) { st.level = 30; st.confidence = 0.4 }
    }
    let hi = 0
    for (const st of arr) { if (st.level === null) continue; if (st.level < hi) st.confidence = Math.min(st.confidence, 0.3); hi = Math.max(hi, st.level) }
  }
  const missing = steps.filter(s => s.level === null).length
  if (missing) warnings.push(`${missing} step(s) have no readable level – fill them in below.`)
  progress?.('Done', 1)
  return { tileSize: T, skills: mergedSkills, steps, warnings, detection: d, headers: headersOut }
}

function parseLevel(txt: string): number | null {
  const m = txt.replace(/[Oo]/g, '0').match(/(\d{1,2})\s*$/) ?? txt.match(/\b(\d{1,2})\b/)
  if (!m) return null
  const n = Number(m[1]); return n >= 1 && n <= 30 ? n : null
}
function labelName(txt: string): string {
  const n = txt.replace(/[-–:]?\s*\d{1,2}\s*$/, '').replace(/^\s*[-–:]+|[-–:]+\s*$/g, '').trim()
  if (/^(free|max|done)$/i.test(n)) return ''
  return n.length >= 2 && /[a-z]/i.test(n) ? cleanName(n) : ''
}
function cleanName(n: string) { return n.replace(/\s+/g, ' ').replace(/[|_]/g, '').trim() }
function groupFromText(t: string): ChartSkill['group'] | null {
  const s = t.toLowerCase()
  if (/stat/.test(s)) return 'stat'
  if (/master/.test(s)) return 'mastery'
  if (/enhanc|boost/.test(s)) return 'boost'
  if (/common/.test(s)) return 'common'
  if (/skill|origin|ascent/.test(s)) return 'skill'
  return null
}

export function tileOf(d: Detection, index: number): SeqTile | undefined { return d.seq[index] }
