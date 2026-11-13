import fs from 'node:fs'
import { PNG } from 'pngjs'
import { detect } from '../src/lib/chart/detect'
for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(file))
  const t0 = Date.now()
  const d = detect({ width: png.width, height: png.height, data: png.data })
  console.log(file.split('/').pop(), 'ms', Date.now() - t0, 'tile', d.tileSize, 'legend', d.legend.map(l => l.tiles.length).join(','), 'rows', d.rows.map(r => r.length).join(','), 'clusters', d.clusters.length)
  console.log(d.rows.map(r => r.map(t => String.fromCharCode(65 + t.cluster)).join('')).join('\n'))
}
