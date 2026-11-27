/** Markers on the game's own map (main/gameMap.ts): how the search for the game's map is going. */
export interface GameMapState {
  /**
   * off: no overlay; nomap: no picture of your zone to match; searching: the game's map is not on
   * the screen (or not found yet); found: it is, and the markers are on it.
   */
  status: 'off' | 'nomap' | 'searching' | 'found'
  /** The zone matched against (questlog.gg world id). */
  world: number | null
  /** How many points agreed on where the map is (more is surer). */
  inliers: number
  /** Or, found by comparing the picture whole, how well it compared (0 to 100). */
  score?: number
  /** How long a match takes, in ms. */
  ms: number
  /**
   * The map matched against: the one the app ships, the game's own at full detail, or that one
   * being downloaded (once per zone; the shipped one is used meanwhile).
   */
  detail?: 'shipped' | 'loading' | 'ready'
  /** How the last picture was placed: local, flow, near, zone; wait or error when it was not. */
  mode?: string
  /** The last thing that went wrong (capture, OpenCV), and when. */
  error?: { at: number; text: string } | null
  /** The screen capture: being started, running, running the slow way (the stream gave no pictures), or not to be had (see the map log). */
  capture?: 'starting' | 'on' | 'slow' | 'failed'
  /** Pictures taken since the overlay opened. */
  pictures?: number
  /** What the overlay sees, now and then: a small JPEG (Map V2 shows it). */
  preview?: string | null
}

export interface MapTile {
  c: number
  r: number
  data: ArrayBuffer
}

export type MapDetail =
  | { kind: 'features'; data: ArrayBuffer; whole: boolean }
  | { kind: 'tiles'; cols: number; rows: number; tiles: MapTile[] }
  | null

/** Start of the two-tile group containing the normalized map position on this axis. */
export function detailGroupAt(position: number, tiles: number, previous?: number): number {
  const tile = Math.min(tiles - 1, Math.max(0, position * tiles))
  // Adjacent groups overlap. Small movements at their seam can reuse the current descriptors.
  if (previous !== undefined && tile >= previous - 0.25 && tile < previous + 2.25) return previous
  return 2 * Math.floor(tile / 2)
}

/** Include a one-tile margin around each group, clipped to the zone. */
export function detailTiles(cols: number, rows: number, col: number, row: number): [number, number][] {
  const tiles: [number, number][] = []
  for (let r = Math.max(0, row - 1); r < Math.min(rows, row + 3); r++) {
    for (let c = Math.max(0, col - 1); c < Math.min(cols, col + 3); c++) tiles.push([c, r])
  }
  return tiles
}

/** A report that tells something (its status, zone, map, mode, capture or error; its match moving by more than a little), not just a new picture's timing. */
export function gameMapChanged(next: GameMapState, was: GameMapState | null): boolean {
  if (!was) return true
  return (
    next.status !== was.status ||
    next.world !== was.world ||
    next.detail !== was.detail ||
    next.mode !== was.mode ||
    next.capture !== was.capture ||
    next.error?.at !== was.error?.at ||
    Math.abs(next.inliers - was.inliers) > 3 ||
    Math.abs((next.score ?? 0) - (was.score ?? 0)) > 3
  )
}
