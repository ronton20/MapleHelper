// reads every badge of a badge-style chart and (for the Lethe sample) checks against the hand-read levels:
// npx tsx scripts/badge-acc.ts chart.png   (file name containing "lethe", "dawn" or "merc" → checked against the hand-read levels)
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect } from '../src/lib/chart/detect'
import { prepareBadge } from '../src/lib/chart/ocrprep'
import { readBadgeDigits, segmentGlyphs } from '../src/lib/chart/badgeDigits'
const png = PNG.sync.read(fs.readFileSync(process.argv[2])); const p = { width: png.width, height: png.height, data: png.data }
const d = detect(p)
const res = d.seq.map(t => { const bm = prepareBadge(p, { x: t.x + t.w * 0.42, y: t.y + t.h * 0.55, w: t.w * 0.85, h: t.h * 0.62 }, 6); const r = readBadgeDigits(bm); return { ...r, n: segmentGlyphs(bm).map(g => `${g.width}x${g.height}`).join('+') } })
const rows: string[] = []; let line: string[] = []
d.seq.forEach((t, i) => { if (i && t.row !== d.seq[i - 1].row) { rows.push(line.join(' ')); line = [] } line.push((res[i].text || '?').padStart(2) + (res[i].conf < 0.5 ? '!' : ' ')) })
rows.push(line.join(' ')); console.log(rows.join('\n'))
console.log('split cases', res.map((r, i) => r.text.length === 2 && Number(r.text) > 30 ? `${i}:${r.text}(${r.n})` : '').filter(Boolean).join(' '))
import { LETHE_TRUTH, DAWN_TRUTH, MERC_TRUTH } from './lethe-truth'
const TRUTH = process.argv[2].includes('lethe') ? LETHE_TRUTH : process.argv[2].includes('dawn') ? DAWN_TRUTH : process.argv[2].includes('merc') ? MERC_TRUTH : null
if (TRUTH) { const bad = TRUTH.map((v, i) => Number(res[i].text) === v ? '' : `${i}:${v}→${res[i].text || '?'}`).filter(Boolean); console.log('accuracy', TRUTH.length - bad.length, '/', TRUTH.length, bad.join(' ')) }
