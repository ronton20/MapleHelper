// node harness for the full importer: npx tsx scripts/analyze-test.ts chart.png
import fs from 'node:fs'
import { PNG } from 'pngjs'
import { createWorker, PSM } from 'tesseract.js'
import { analyzeChart, type OcrWord } from '../src/lib/chart/analyze'
import type { Box } from '../src/lib/chart/detect'
import { prepareForOcr } from '../src/lib/chart/ocrprep'

const png = PNG.sync.read(fs.readFileSync(process.argv[2]))
const p = { width: png.width, height: png.height, data: png.data }

function crop(b: Box, scale: number, dropSides = false, binary = false): Buffer {
  const bm = prepareForOcr(p, b, scale, dropSides, binary)
  const out = new PNG({ width: bm.width, height: bm.height })
  for (let i = 0; i < bm.gray.length; i++) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = bm.gray[i]; out.data[i * 4 + 3] = 255 }
  if (process.env.DUMP) fs.writeFileSync(`/tmp/band_${b.y}_${Math.round(b.w)}.png`, PNG.sync.write(out))
  return PNG.sync.write(out)
}

async function main() {
  const worker = await createWorker('eng', 1, { langPath: 'public/tessdata', gzip: true, cachePath: '/tmp/tesscache', logger: () => {} })
  const ocr = async (box: Box, mode: 'line' | 'block' | 'word' | 'wordgray', digitsOnly: boolean, dropSides = false): Promise<OcrWord[]> => {
    const scale = mode === 'block' ? 3 : 4
    await worker.setParameters({ tessedit_pageseg_mode: mode === 'line' ? PSM.SINGLE_LINE : mode === 'word' || mode === 'wordgray' ? PSM.SINGLE_WORD : PSM.SINGLE_BLOCK, tessedit_char_whitelist: digitsOnly ? '0123456789' : '' })
    const r = await worker.recognize(crop(box, scale, dropSides, mode === 'word' || mode === 'line'), {}, { blocks: true })
    const words = (r.data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(pp => pp.lines.flatMap(l => l.words)))
    return words.map(w => ({ text: w.text, conf: w.confidence, x0: box.x + w.bbox.x0 / scale, y0: box.y + w.bbox.y0 / scale, x1: box.x + w.bbox.x1 / scale, y1: box.y + w.bbox.y1 / scale }))
  }
  const refs = [['stat1','HEXA Stat I','stat'],['stat2','HEXA Stat II','stat'],['stat3','HEXA Stat III','stat'],['hecate1','Sol Hecate','common'],['hecate20','Sol Hecate','common'],['hecate30','Sol Hecate','common']].map(([f, name, type]) => {
    const im = PNG.sync.read(fs.readFileSync(`public/icons/ref/${f}.png`)); return { name, type: type as any, pixels: { width: im.width, height: im.height, data: im.data } }
  })
  const t0 = Date.now()
  const a = await analyzeChart(p, ocr, (m, f) => process.stderr.write(`${(f * 100).toFixed(0)}% ${m}\n`), refs)
  console.log('ms', Date.now() - t0, 'warnings', a.warnings, 'headers', a.headers)
  console.log(a.skills.map(s => `${s.id} [${s.type ?? '?'}/${s.group ?? '?'}] "${s.name}" (${s.nameSource}, x${s.count})`).join('\n'))
  const name = (id: string) => a.skills.find(s => s.id === id)?.name || id
  let line = '', lastRow = -1
  for (const st of a.steps) {
    const t = a.detection.seq[st.index]
    if (t.row !== lastRow) { if (line) console.log(line); line = ''; lastRow = t.row }
    line += `${name(st.skillId).slice(0, 8)}:${st.level ?? '?'}${st.confidence < 0.5 ? '!' : ''} `
  }
  console.log(line)
  console.log('UNREADABLE', a.steps.filter(s => s.level === null).map(s => `#${s.index}@${s.tile.x},${s.tile.y} "${s.labelText}"`).join(' | '))
  await worker.terminate()
}
main()
// (debug) list unreadable steps
