/**
 * The game's Journal open on its Duty tab, told by looking at the screen: once the board is loaded,
 * opening it again sends nothing the app can read (its `41 8D` comes as it closes, 2026-11-26), so the
 * duty window opens as the tab is seen. The Journal's top band (its title, the Duty tab lit, Mission
 * under it) is learned once, the tab open (`learn`): its bright spots, the text the game draws white.
 * Then, while the game is in front and you are not fighting, the band is looked at a few times a
 * second: most of those spots bright again, and few others, is the tab. Seen, the window opens;
 * gone, it closes. Closed by its X while the tab is up, it waits for the tab to go and come back.
 */
import { screen, type Display } from 'electron'
import { dataFile } from './dataFile.ts'
import { screenGrey } from './screenGrey.ts'
import { log } from './tracker.ts'
import { overlayBounds, shownOverlayBounds } from './windows.ts'

/** The picture: half the display's size, its top band (the Journal's title and tabs). */
const SCALE = 0.5
const BAND = 0.11
/**
 * What a learned picture is: one of another version is learned again. The first way (most of the
 * band's bright spots) is the one kept: its words one by one (the title and the sub-tab) worked worse
 * in game (2026-11-26).
 */
const VERSION = 5
const EVERY_MS = 600
/** A learned spot counts as bright from this share of the band's brightest. */
const BRIGHT = 0.72
/** The tab: this share of the learned bright spots bright again... */
const MATCH = 0.7
/** ...and at most this many others (a share of the learned): another tab lit, a bright scene. */
const EXTRA = 0.35
/** Too few bright spots learned: not the Journal (learned with something else in front). */
const FEWEST = 40
/** Learning waits this long for the game to be in front. */
const WAIT_MS = 15_000
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Print {
  version: number
  /** The display it was learned on: another size, and it is learned again. */
  display: { width: number; height: number }
  width: number
  height: number
  level: number
  bright: number[]
  at: number
}

const file = dataFile('duty-screen.json')
let print: Print | null = null
let timer: NodeJS.Timeout | null = null
let busy = false
let up = false
let misses = 0
let watching: DutyScreenWatch | null = null

export interface DutyScreenWatch {
  /** Looked at only then: the game in front, not fighting. */
  looking: () => boolean
  seen: () => void
  gone: () => void
}

/** The display the game is on: the Unified HUD's, else the primary. */
function gameDisplay(): Display {
  const hud = overlayBounds('unified')
  return hud ? screen.getDisplayMatching(hud) : screen.getPrimaryDisplay()
}

async function band(display: Display): Promise<{ width: number; height: number; spots: Int16Array } | null> {
  const size = { width: Math.round(display.size.width * SCALE), height: Math.round(display.size.height * SCALE) }
  return screenGrey(display, size, shownOverlayBounds(), BAND)
}

export const dutyScreen = {
  /** When it was learned, or null. */
  learned(): number | null {
    return print?.at ?? null
  },
  /**
   * Learn the band: asked from the dashboard, so once the game is back in front (up to `WAIT_MS`) and
   * a moment after, the Journal open on Duty.
   */
  async learn(): Promise<{ ok: boolean; spots: number }> {
    const until = Date.now() + WAIT_MS
    while (!watching?.looking() && Date.now() < until) await sleep(250)
    if (!watching?.looking()) return { ok: false, spots: 0 }
    await sleep(1_000)
    const display = gameDisplay()
    const pic = await band(display)
    if (!pic) return { ok: false, spots: 0 }
    let max = 0
    for (const v of pic.spots) if (v > max) max = v
    const level = Math.round(max * BRIGHT)
    const bright: number[] = []
    pic.spots.forEach((v, i) => v >= level && bright.push(i))
    if (bright.length < FEWEST) {
      log(`duty screen: not learned, ${bright.length} bright spots`)
      return { ok: false, spots: bright.length }
    }
    print = { version: VERSION, display: { width: display.size.width, height: display.size.height }, width: pic.width, height: pic.height, level, bright, at: Date.now() }
    file.save(() => print)
    log(`duty screen: learned, ${bright.length} bright spots at ${level}+ on ${display.size.width}x${display.size.height}`)
    return { ok: true, spots: bright.length }
  },
  forget(): void {
    print = null
    file.save(() => null)
  },
}

/** Whether the band now is the learned tab's (null: nothing to tell, the picture not taken). */
async function isTab(): Promise<boolean | null> {
  if (!print) return null
  const display = gameDisplay()
  if (display.size.width !== print.display.width || display.size.height !== print.display.height) return null
  const pic = await band(display)
  if (!pic || pic.width !== print.width || pic.height !== print.height) return null
  const learned = new Set(print.bright)
  let total = 0
  let lit = 0
  for (const i of print.bright) {
    const v = pic.spots[i]!
    if (v < 0) continue
    total++
    if (v >= print.level) lit++
  }
  let extra = 0
  pic.spots.forEach((v, i) => v >= print!.level && !learned.has(i) && extra++)
  if (total < FEWEST) return null
  return lit / total >= MATCH && extra <= total * EXTRA
}

export function watchDutyScreen(w: DutyScreenWatch): void {
  const saved = file.read() as Print | null
  print = saved && saved.version === VERSION && Array.isArray(saved.bright) ? saved : null
  watching = w
  timer ??= setInterval(() => void look(w), EVERY_MS)
}

async function look(w: DutyScreenWatch): Promise<void> {
  if (!print || busy || !w.looking()) return
  busy = true
  try {
    const tab = await isTab()
    if (tab === null) return
    if (tab) {
      misses = 0
      if (!up) {
        up = true
        w.seen()
      }
    } else if (up && ++misses >= 2) {
      up = false
      w.gone()
    }
  } catch {
    // No picture this time (the screen locked, a display going away): the next look tries again.
  } finally {
    busy = false
  }
}

