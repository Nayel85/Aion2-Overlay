// Every store keeps its JSON file through main/jsonFile.ts (dataFile): read the same way, written safely,
// a pending save written as the app quits. No module of main reads or writes its own JSON file, but the
// item details' cache (one file per item, kept or fetched again) and the PvP history (lines appended).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const MAIN = join(import.meta.dirname, '..', 'src', 'main')
const OWN_WAY = ['jsonFile.ts', 'itemDetails.ts', 'pvpHistory.ts']

test("the stores' JSON files are kept through jsonFile.ts alone", () => {
  const bad: string[] = []
  for (const f of readdirSync(MAIN).filter((n) => n.endsWith('.ts') && !OWN_WAY.includes(n))) {
    readFileSync(join(MAIN, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/writeFile(Sync)?\([^)]*JSON\.stringify|JSON\.parse\(readFileSync\((?!join\(__dirname)/.test(line)) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`)
      })
  }
  assert.deepEqual(bad, [], 'keep the file with dataFile (main/dataFile.ts)')
})
