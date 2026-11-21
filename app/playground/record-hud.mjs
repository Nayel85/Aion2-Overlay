// Records a small, HUD-only video (no captions, no intro) for sharing:
//   node playground/record-hud.mjs [out.mp4]
// The Unified HUD alone, close up: it unfolds on hover, each button's peek, the buttons as toggles, and
// the states (your target, enemies and a cube nearby, the events, Odyle energy, Abyss Points).
import { join } from 'node:path'
import { startRecording } from './recorder.mjs'

const OUT = process.argv[2] ?? join(process.env.HOME ?? '.', 'Videos', 'lokthar-hud.mp4')
// 8 minutes before an event, so the bar shows its countdown.
const AT = '2026-11-20T11:52:00Z'
// The stage is the background's own size (PROMO_BG=./backgrounds/x.webp PROMO_SIZE=2048x858), with the
// HUD centred on it.
const BG = process.env.PROMO_BG ?? './backgrounds/widescreen.webp'
const [W, H] = (process.env.PROMO_SIZE ?? '2048x858').split('x').map(Number)
const CLIP_W = 1360
const r = await startRecording({
  out: OUT,
  width: W,
  height: H,
  url: (slow) => `http://localhost:5199/promo.html?slow=${slow}&bare=1&mini=1&zoom=1.25&at=${AT}&w=${W}&h=${H}&bg=${encodeURIComponent(BG)}`,
  // The HUD from the top centre of the 1.25× stage, with room for its peeks and the widest bar.
  clip: { x: Math.round(W / 2 - CLIP_W / 2), y: 0, width: CLIP_W, height: 450 },
  scaleTo: 960,
})
const { wait, glide, click, rectOf, toButton, evaluate } = r
const sim = (call) => evaluate(`window.promo.sim.${call}`)
const center = (js) => evaluate(`(() => { const e = ${js}; if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } })()`)
const chip = (text) => center(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}))`)
const to = async (at, s = 0.6) => { if (!at) throw new Error('not found'); await glide(at.x, at.y, s) }
// Off to the left, so the way back to a chip never crosses the buttons.
const away = () => glide(300, 330, 0.8)

await r.call('cursor(true)')
await wait(2.2) // the compact bar: the next events (one close, with its countdown) and the ping

// Hover: it unfolds.
const bar = await rectOf('.cursor-move')
await glide(bar.x - 60, bar.y, 1)
await wait(1.2)

// Each button peeks at its widget.
// A quick look at each: about a second on every one.
for (const label of ['DPS meter', 'Map', 'Kill feed', 'Pets and soul drops']) {
  await toButton(label, 0.4)
  await wait(1)
}

// Click: the overlay itself, on and off (the icon lights while it is on).
await toButton('DPS meter', 0.6)
await wait(0.4)
await click()
await wait(1.3)
await click()
await wait(0.9)

// The events: hover them.
await to(await rectOf('button[aria-label="Next events"]'), 0.7)
await wait(1.6)
await away()
await wait(1.2)

// A chip moves when the bar unfolds, so hover the bar first and aim at the chip where it ended up.
async function toChip(find) {
  const bar = await rectOf('.cursor-move')
  await glide(bar.x - 120, bar.y, 0.7)
  await wait(0.6)
  await to(await find(), 0.6)
}

// Your target: a boss, then a player.
await sim('hitMonster(3500)')
await wait(7)
await sim('selectPlayer()')
await wait(2.8)
await sim('clearTarget()')
await wait(0.8)

// Enemies in view, then a cube.
await sim('enemies()')
await wait(1.2)
await toChip(() => rectOf('button[aria-label*="enemies who can attack"]'))
await wait(2)
await away()
await sim('noEnemies()')
await wait(0.8)
await sim('cube()')
await wait(1.2)
await toChip(() => chip('Hidden Cube'))
await wait(2)
await away()
await sim('noCube()')
await wait(0.8)

// Abyss Points this season.
await sim('abyssKill(300)')
await wait(0.9)
await sim('abyssKill(280)')
await wait(0.9)
await sim('abyssKill(320)')
await wait(2.4)

await sim('reset()')
await r.call('cursor(false)')
await wait(1.2)
await r.finish()
