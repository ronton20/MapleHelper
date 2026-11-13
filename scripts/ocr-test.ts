import fs from 'node:fs'
import { PNG } from 'pngjs'
import { createWorker, PSM } from 'tesseract.js'
import { detect } from '../src/lib/chart/detect'

const png = PNG.sync.read(fs.readFileSync(process.argv[2]))
const p = { width: png.width, height: png.height, data: png.data }
const d = detect(p)

function crop(x: number, y: number, w: number, h: number, scale: number): Buffer {
  x = Math.max(0, x); y = Math.max(0, y); w = Math.min(w, p.width - x); h = Math.min(h, p.height - y)
  const out = new PNG({ width: w * scale, height: h * scale })
  for (let yy = 0; yy < h * scale; yy++) for (let xx = 0; xx < w * scale; xx++) {
    const si = ((y + Math.floor(yy / scale)) * p.width + (x + Math.floor(xx / scale))) * 4
    const di = (yy * w * scale + xx) * 4
    // invert to black text on white (tesseract likes that)
    out.data[di] = 255 - p.data[si]; out.data[di + 1] = 255 - p.data[si + 1]; out.data[di + 2] = 255 - p.data[si + 2]; out.data[di + 3] = 255
  }
  return PNG.sync.write(out)
}

async function main() {
  const t0 = Date.now()
  const worker = await createWorker('eng', 1, { langPath: 'public/tessdata', gzip: true, cachePath: '/tmp/tesscache', logger: () => {} })
  console.log('worker ready', Date.now() - t0, 'ms')
  // numbers under each sequence row
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: '0123456789free' })
  for (const row of d.rows.slice(0, 2)) {
    const y = row[0].y + row[0].h + 1, h = Math.round(d.tileSize * 0.5)
    const buf = crop(0, y, p.width, h, 3)
    const r = await worker.recognize(buf, {}, { blocks: true })
    const words = (r.data.blocks ?? []).flatMap(b => b.paragraphs.flatMap(pp => pp.lines.flatMap(l => l.words)))
    const byTile = row.map(t => {
      const w = words.filter(w => Math.abs((w.bbox.x0 + w.bbox.x1) / 2 / 3 - t.cx) < t.w * 0.6)
      return w.map(x => x.text).join('') || '?'
    })
    console.log(byTile.join(' '))
  }
  // legend names
  if (d.legendTextBand) {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: '' })
    const b = d.legendTextBand
    const r = await worker.recognize(crop(b.x, b.y, b.w, b.h, 2), {}, { blocks: true })
    const words = (r.data.blocks ?? []).flatMap(bl => bl.paragraphs.flatMap(pp => pp.lines.flatMap(l => l.words)))
    const names = d.legend.map(l => {
      const cx = l.box.x + l.box.w / 2
      const ws = words.filter(w => Math.abs((w.bbox.x0 + w.bbox.x1) / 2 / 2 - cx) < Math.max(l.box.w, d.tileSize * 1.6) * 0.55)
        .sort((a, b2) => (a.bbox.y0 - b2.bbox.y0) || (a.bbox.x0 - b2.bbox.x0))
      return ws.map(w => w.text).join(' ')
    })
    console.log(names)
  }
  // headers
  if (d.headerBand) {
    const b = d.headerBand
    const r = await worker.recognize(crop(b.x, b.y, b.w, b.h, 2), {}, { blocks: true })
    const words = (r.data.blocks ?? []).flatMap(bl => bl.paragraphs.flatMap(pp => pp.lines.flatMap(l => l.words)))
    console.log('headers:', words.map(w => `${w.text}@${Math.round((w.bbox.x0 + w.bbox.x1) / 4)}`).join(' '))
  }
  console.log('total ms', Date.now() - t0)
  await worker.terminate()
}
main()
