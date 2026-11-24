// Everything to pass before a commit: the types, the app's tests, the translations, the engine's
// tests, and the build. `npm run check` (all of it), `npm run check -- --quick` (no build: the git
// hook's). The steps are independent: they run at once, each to its end, then a summary with every
// failure's output. (The build does not check the types: it passes or fails on its own.)
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const engine = join(app, '..', 'engine')
const quick = process.argv.includes('--quick')
// Cargo where rustup puts it, whatever the shell's PATH.
const env = { ...process.env, PATH: `${process.env.PATH}${delimiter}${join(homedir(), '.cargo', 'bin')}` }

const steps = [
  { name: 'Types (main)', line: 'npm run typecheck:node', cwd: app },
  { name: 'Types (windows)', line: 'npm run typecheck:web', cwd: app },
  { name: 'App tests', line: 'npm test', cwd: app },
  { name: 'Translations', line: 'node scripts/i18n-check.mjs', cwd: app },
  { name: 'Engine tests', line: 'cargo test --release --quiet', cwd: engine },
  ...(quick ? [] : [{ name: 'Build', line: 'npm run build', cwd: app }]),
]

/** One step to its end: whether it passed, how long, what it said. One shell line (npm is a .cmd on Windows); the lines are ours, fixed. */
function run(step) {
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(step.line, { cwd: step.cwd, env, shell: true })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    child.on('close', (code) => resolve({ ...step, ok: code === 0, secs: ((Date.now() - started) / 1000).toFixed(1), out }))
  })
}

const started = Date.now()
const results = await Promise.all(steps.map(run))
const failed = results.filter((r) => !r.ok)
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.secs} s)`)
for (const r of failed) {
  console.log(`\n──── ${r.name} ────`)
  console.log(r.out.trim().split('\n').slice(-40).join('\n'))
}
console.log(`\n${failed.length ? `${failed.length} failed` : 'All passed'} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
process.exit(failed.length ? 1 : 0)
