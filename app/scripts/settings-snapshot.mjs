// Writes what normalise() makes of every setting (tests/settingsSnapshot.ts) to a file: the
// reference settings.test.ts compares with. Run after a change to the settings meant to be.
// `npm run settings:snapshot`
import { writeFileSync } from 'node:fs'

const { settingsSnapshot } = await import('../tests/settingsSnapshot.ts')
const all = settingsSnapshot()
writeFileSync(process.argv[2], JSON.stringify(all, null, 1) + '\n')
console.log(`${Object.keys(all).length} settings written to ${process.argv[2]}`)
