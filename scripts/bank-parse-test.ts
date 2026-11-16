// sanity test for the admin folder upload parsing: npx tsx scripts/bank-parse-test.ts <hexa-skills dir>
import fs from 'node:fs'
import { parseBankCsv, slotKeyFromLabel, assignSlots, nodesFromBank, type SkillBank } from '../src/data/skillBank'
const root = process.argv[2]
let total = 0; const problems: string[] = []; const banks: Record<string, SkillBank> = {}
for (const dir of fs.readdirSync(root)) {
  const p = `${root}/${dir}/skills.csv`; if (!fs.existsSync(p)) continue
  const rows = parseBankCsv(fs.readFileSync(p, 'utf8'))
  const entries = rows.map(r => ({ slot: slotKeyFromLabel(r.slot, dir), name: r.name, primary: r.primary, icon: 'data:image/png;base64,' }))
  for (const e of entries) if (!e.slot) problems.push(`${dir}: ${e.name}`)
  total += entries.length
  banks[dir] = { classKey: dir, entries: entries.filter(e => e.slot) as any, updatedAt: 0 }
}
console.log('icons', total, 'banks', Object.keys(banks).length, 'unknown slots', problems)
console.log('common slots', [...new Set(banks.common.entries.map(e => e.slot))])
console.log('mercedes nodes', nodesFromBank(banks.mercedes, banks.common).map(n => `${n.id}:${n.name}`).join(' | '))
const legacy = [{ id: 'o1', name: 'Unfading Glory', type: 'origin' }, { id: 'm1', name: 'Leaf Tornado', type: 'mastery' }, { id: 'm2', name: 'Ishtars Ring', type: 'mastery' }, { id: 'c2', name: 'Sol Hecate', type: 'common' }, { id: 'stat1', name: 'HEXA Stat I', type: 'stat' }, { id: 'b9', name: 'Some boost', type: 'boost' }] as any
console.log('assign', assignSlots(legacy, banks.mercedes, banks.common)!.map(n => `${n.name}→${n.slot}`).join(' | '))
