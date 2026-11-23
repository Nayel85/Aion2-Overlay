import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyDataFolder } from '../src/main/migrate.ts'

test("Lokthar's data is copied in on the first start, Chromium's caches left out, the original kept", () => {
  const root = mkdtempSync(join(tmpdir(), 'migrate-'))
  try {
    const from = join(root, 'Lokthar')
    const to = join(root, 'Nayel Overlay')
    mkdirSync(join(from, 'history'), { recursive: true })
    mkdirSync(join(from, 'GPUCache'))
    writeFileSync(join(from, 'settings.json'), '{"a":1}')
    writeFileSync(join(from, 'sessions.json'), '{"current":null}')
    writeFileSync(join(from, 'history', 'fight.json'), '{}')
    // Chromium has made the new folder, with its own state, before the app's code runs.
    mkdirSync(to)
    writeFileSync(join(to, 'Local State'), 'new')

    assert.match(copyDataFolder(from, to), /^copied /)
    assert.equal(readFileSync(join(to, 'sessions.json'), 'utf8'), '{"current":null}')
    assert.ok(existsSync(join(to, 'history', 'fight.json')))
    assert.ok(!existsSync(join(to, 'GPUCache')))
    assert.equal(readFileSync(join(to, 'Local State'), 'utf8'), 'new')
    assert.ok(existsSync(join(from, 'sessions.json')))

    // Once this app has its settings, never again.
    writeFileSync(join(from, 'sessions.json'), '{"current":"later"}')
    assert.equal(copyDataFolder(from, to), 'nothing to copy')
    assert.equal(readFileSync(join(to, 'sessions.json'), 'utf8'), '{"current":null}')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
