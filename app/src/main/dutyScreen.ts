/**
 * The game's Journal open on its Duty tab, told by looking at the screen: once the board is loaded,
 * opening it again sends nothing the app can read (its `41 8D` comes as it closes, 2026-11-26), so the
 * duty window opens as the tab is seen. What is looked for is its sub-tab's word, lit (the game draws
 * the chosen one white): Mission, or Command beside it. Those are under Duty alone; the Journal's
 * title and tabs light up as it opens, before them, and opened the window too soon.
 *
 * Learned once, the Journal open on Duty and Mission (`learn`): the top band's bright spots grouped
 * into words, the lowest one Mission. Then, while the game is in front and you are not fighting, the
 * band is looked at a few times a second: Mission's spots bright again, or a word as big lit just
 * right of it (Command), is the tab. Seen, the window opens; gone, it closes. Closed by its X while the
 * tab is up, it waits for the tab to go and come back.
 */
import { screen, type Display } from 'electron'
import { dataFile } from './dataFile.ts'
import { screenGrey } from './screenGrey.ts'
import { log } from './tracker.ts'
import { overlayBounds, shownOverlayBounds } from './windows.ts'

/** The picture: half the display's size, its top band (the Journal's title, its tabs and Mission under them: 12% down on a 1152-high screen). */
const SCALE = 0.5
const BAND = 0.16
/** What a learned picture is: one of another version is learned again. */
const VERSION = 3
const EVERY_MS = 600
/** A spot counts as bright from this share of the band's brightest when learned. */
const BRIGHT = 0.72
/** Mission: this share of its spots bright again. */
const MATCH = 0.7
/** Command: lit spots right of Mission, within this many Mission widths, this many times Mission's. */
const COMMAND_SPAN = 4
const COMMAND_SIZE = [0.5, 2.5] as const
/** A word: bright spots this close (in spots) are one; fewer than WORD_MIN of them, a speck. */
const GAP_X = 4
const GAP_Y = 2
const WORD_MIN = 6
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
  /** Mission's spots, and its box. */
  word: number[]
  box: { left: number; right: number; top: number; bottom: number }
  at: number
}

/** The bright spots grouped into words: those close enough to each other, one. */
function wordsOf(bright: number[], width: number): number[][] {
  const at = new Map(bright.map((i, n) => [i, n]))
  const root = bright.map((_, n) => n)
  const find = (n: number): number => (root[n] === n ? n : (root[n] = find(root[n]!)))
  bright.forEach((i, n) => {
    const x = i % width
    for (let dy = 0; dy <= GAP_Y; dy++)
      for (let dx = -GAP_X; dx <= GAP_X; dx++) {
        if ((dy === 0 && dx <= 0) || x + dx < 0 || x + dx >= width) continue
        const m = at.get(i + dy * width + dx)
        if (m !== undefined) root[find(m)] = find(n)
      }
  })
  const words = new Map<number, number[]>()
  bright.forEach((i, n) => words.set(find(n), [...(words.get(find(n)) ?? []), i]))
  return [...words.values()].filter((w) => w.length >= WORD_MIN)
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
   * Learn Mission: asked from the dashboard, so once the game is back in front (up to `WAIT_MS`) and
   * a moment after, the Journal open on Duty and Mission.
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
    // Mission: the lowest word, whole in the band.
    const boxOf = (w: number[]): Print['box'] => {
      const xs = w.map((i) => i % pic.width)
      const ys = w.map((i) => Math.floor(i / pic.width))
      return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
    }
    const word = wordsOf(bright, pic.width)
      .filter((w) => boxOf(w).bottom < pic.height - 1)
      .sort((a, b) => boxOf(b).top - boxOf(a).top)[0]
    if (!word) {
      log(`duty screen: not learned, no word among ${bright.length} bright spots`)
      return { ok: false, spots: bright.length }
    }
    const box = boxOf(word)
    print = { version: VERSION, display: { width: display.size.width, height: display.size.height }, width: pic.width, height: pic.height, level, word, box, at: Date.now() }
    file.save(() => print)
    log(`duty screen: learned Mission, ${word.length} spots at ${level}+, ${Math.round((box.left / pic.width) * 100)}-${Math.round((box.right / pic.width) * 100)}% across, ${box.top}-${box.bottom} down, on ${display.size.width}x${display.size.height}`)
    return { ok: true, spots: word.length }
  },
  forget(): void {
    print = null
    file.save(() => null)
  },
}

/** Whether the sub-tab lit now is Mission or Command (null: nothing to tell, no picture or Mission under this app's windows). */
async function isTab(): Promise<boolean | null> {
  if (!print) return null
  const display = gameDisplay()
  if (display.size.width !== print.display.width || display.size.height !== print.display.height) return null
  const pic = await band(display)
  if (!pic || pic.width !== print.width || pic.height !== print.height) return null
  const { level, word, box } = print
  let seen = 0
  let lit = 0
  for (const i of word) {
    const v = pic.spots[i]!
    if (v < 0) continue
    seen++
    if (v >= level) lit++
  }
  if (seen < WORD_MIN) return null
  if (lit / seen >= MATCH) return true
  // Command: as big a word lit on Mission's line, right of it.
  const wide = box.right - box.left + 1
  let command = 0
  for (let y = Math.max(0, box.top - 1); y <= Math.min(pic.height - 1, box.bottom + 1); y++)
    for (let x = box.right + 1; x <= Math.min(pic.width - 1, box.right + wide * COMMAND_SPAN); x++) if (pic.spots[y * pic.width + x]! >= level) command++
  return command >= word.length * COMMAND_SIZE[0] && command <= word.length * COMMAND_SIZE[1]
}

export function watchDutyScreen(w: DutyScreenWatch): void {
  const saved = file.read() as Print | null
  print = saved && saved.version === VERSION && Array.isArray(saved.word) ? saved : null
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
