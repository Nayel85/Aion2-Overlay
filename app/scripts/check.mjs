// Everything to pass before a commit: the types, the app's tests, the translations, the engine's
// tests, and the build. `npm run check` (all of it), `npm run check -- --quick` (no build: the git
// hook's). Stops at the first that fails, with its output.
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const engine = join(app, '..', 'engine')
const quick = process.argv.includes('--quick')
// Cargo where rustup puts it, whatever the shell's PATH.
const env = { ...process.env, PATH: `${process.env.PATH}${delimiter}${join(homedir(), '.cargo', 'bin')}` }

const steps = [
  ['Types', 'npm', ['run', 'typecheck'], app],
  ['App tests', 'npm', ['test'], app],
  ['Translations', 'node', ['scripts/i18n-check.mjs'], app],
  ['Engine tests', 'cargo', ['test', '--release', '--quiet'], engine],
  ...(quick ? [] : [['Build', 'npm', ['run', 'build'], app]]),
]

for (const [name, cmd, args, cwd] of steps) {
  const started = Date.now()
  // One command line through the shell (npm is a .cmd on Windows); the arguments are ours, fixed.
  const r = spawnSync([cmd, ...args].join(' '), { cwd, env, shell: true, encoding: 'utf8' })
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  if (r.status !== 0) {
    console.log(`✗ ${name} (${secs} s)\n`)
    console.log(`${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n'))
    process.exit(1)
  }
  console.log(`✓ ${name} (${secs} s)`)
}
