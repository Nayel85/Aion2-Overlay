/**
 * The game's Journal open on its Duty tab, told by looking at the screen: once the board is loaded,
 * opening it again sends nothing the app can read (its `41 8D` comes as it closes, 2026-11-26), so the
 * duty window opens as the tab is seen: the Journal's title (big, steady) and its sub-tab's word lit
 * (the game draws the chosen one white), Mission or Command beside it. The title alone opened it too
 * soon (it lights up as the Journal opens); the word alone flickered (small, its spots about the
 * threshold, the window closed a second after).
 *
 * Learned once, the Journal open on Duty and Mission (`learn`): the top band's bright spots grouped
 * into words, the lowest one Mission, the biggest on the left the title. Then, while the game is in
 * front and you are not fighting, the band is looked at a few times a second. Both seen, the window
 * opens; the title gone, it closes, and the word gone for a while (another tab of the Journal) too.
 * Closed by its X while the tab is up, it waits for the tab to go and come back.
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
const VERSION = 4
const EVERY_MS = 600
/** A spot counts as bright from this share of the band's brightest when learned. */
const BRIGHT = 0.72
/** A word seen: this share of its spots bright again, at this share of the learned level (its edges flicker). */
const MATCH = 0.6
const LIT = 0.85
/** Looks in a row without the sub-tab's word (the title still there) before the window closes. */
const WORD_MISSES = 4
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
  /** The Journal's title. */
  title: number[]
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
    const words = wordsOf(bright, pic.width)
    const word = words.filter((w) => boxOf(w).bottom < pic.height - 1).sort((a, b) => boxOf(b).top - boxOf(a).top)[0]
    // The title: the biggest word on the left fifth (the Journal's name, by its emblem).
    const title = words.filter((w) => w !== word && boxOf(w).right < pic.width / 5).sort((a, b) => b.length - a.length)[0]
    if (!word || !title) {
      log(`duty screen: not learned, ${word ? 'no title' : 'no word'} among ${bright.length} bright spots`)
      return { ok: false, spots: bright.length }
    }
    const box = boxOf(word)
    print = { version: VERSION, display: { width: display.size.width, height: display.size.height }, width: pic.width, height: pic.height, level, word, box, title, at: Date.now() }
    file.save(() => print)
    const across = (b: Print['box']): string => `${Math.round((b.left / pic.width) * 100)}-${Math.round((b.right / pic.width) * 100)}% across, ${b.top}-${b.bottom} down`
    log(`duty screen: learned at ${level}+ on ${display.size.width}x${display.size.height}: Mission ${word.length} spots ${across(box)}, title ${title.length} spots ${across(boxOf(title))}`)
    return { ok: true, spots: word.length }
  },
  forget(): void {
    print = null
    file.save(() => null)
  },
}

/** What the band shows now: the title, the sub-tab's word (null: nothing to tell, no picture or under this app's windows). */
async function looked(): Promise<{ title: boolean; word: boolean } | null> {
  if (!print) return null
  const display = gameDisplay()
  if (display.size.width !== print.display.width || display.size.height !== print.display.height) return null
  const pic = await band(display)
  if (!pic || pic.width !== print.width || pic.height !== print.height) return null
  const level = print.level * LIT
  const seen = (spots: number[]): boolean | null => {
    let shown = 0
    let lit = 0
    for (const i of spots) {
      const v = pic.spots[i]!
      if (v < 0) continue
      shown++
      if (v >= level) lit++
    }
    return shown < WORD_MIN ? null : lit / shown >= MATCH
  }
  const title = seen(print.title)
  const mission = seen(print.word)
  if (title === null || mission === null) return null
  if (mission) return { title, word: true }
  // Command: as big a word lit on Mission's line, right of it.
  const { box, word } = print
  const wide = box.right - box.left + 1
  let command = 0
  for (let y = Math.max(0, box.top - 1); y <= Math.min(pic.height - 1, box.bottom + 1); y++)
    for (let x = box.right + 1; x <= Math.min(pic.width - 1, box.right + wide * COMMAND_SPAN); x++) if (pic.spots[y * pic.width + x]! >= level) command++
  return { title, word: command >= word.length * COMMAND_SIZE[0] && command <= word.length * COMMAND_SIZE[1] }
}

export function watchDutyScreen(w: DutyScreenWatch): void {
  const saved = file.read() as Print | null
  print = saved && saved.version === VERSION && Array.isArray(saved.word) && Array.isArray(saved.title) ? saved : null
  watching = w
  timer ??= setInterval(() => void look(w), EVERY_MS)
}

async function look(w: DutyScreenWatch): Promise<void> {
  if (!print || busy || !w.looking()) return
  busy = true
  try {
    const now = await looked()
    if (now === null) return
    if (!up) {
      if (now.title && now.word) {
        up = true
        misses = 0
        w.seen()
      }
      return
    }
    // The title gone: the Journal closed, at the second look. The word gone: another tab, after a while.
    misses = now.title && now.word ? 0 : misses + (now.title ? 1 : WORD_MISSES / 2)
    if (misses >= WORD_MISSES) {
      up = false
      w.gone()
    }
  } catch {
    // No picture this time (the screen locked, a display going away): the next look tries again.
  } finally {
    busy = false
  }
}
