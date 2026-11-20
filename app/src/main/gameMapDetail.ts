/** Fetch the detailed map tiles around the viewport and keep each group's ORB descriptors on disk.
 * Older installs may already have one feature file covering the whole zone. */
import { app } from 'electron'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { detailTiles, type MapDetail, type MapTile } from '../shared/gameMap.ts'
import { glog } from './gameMapLog.ts'

const TILE_CDN = 'https://cdn.questlog.gg/aion-2/assets/Game/UI/Map/WorldMap'
/** Downloads at once. */
const PARALLEL = 4
/** The worker's keypoints file; the number changes when what is in it does. */
const FEATURES = 'features-v1.bin'

const dir = (key: string): string => join(app.getPath('userData'), 'maptiles', key)
const tileName = (c: number, r: number): string => `${String(c).padStart(2, '0')}_${String(r).padStart(2, '0')}.webp`
/** Concurrent requests for the same tile group share a download. */
const pending = new Map<string, Promise<MapDetail>>()

const isKey = (key: string): boolean => /^[A-Za-z0-9_]{1,40}$/.test(key)
const asBuffer = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer

async function download(key: string, cols: number, rows: number, col: number, row: number): Promise<MapDetail> {
  const folder = dir(key)
  await mkdir(folder, { recursive: true })
  const tiles: MapTile[] = []
  const todo = detailTiles(cols, rows, col, row)
  let bytes = 0
  const next = async (): Promise<void> => {
    for (let job = todo.shift(); job; job = todo.shift()) {
      const [c, r] = job
      const file = join(folder, tileName(c, r))
      if (existsSync(file)) {
        tiles.push({ c, r, data: asBuffer(await readFile(file)) })
        continue
      }
      const url = `${TILE_CDN}/${key}/Res/${key}_${tileName(c, r)}`
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      const data = Buffer.from(await res.arrayBuffer())
      bytes += data.length
      // Written whole or not at all: a half tile would be kept as done.
      const tmp = `${file}.${randomUUID()}.part`
      await writeFile(tmp, data)
      await rename(tmp, file)
      tiles.push({ c, r, data: asBuffer(data) })
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, next))
  if (bytes) glog(`${key} detail at ${col},${row}: ${(bytes / 1_048_576).toFixed(1)} MB downloaded`)
  return { kind: 'tiles', cols, rows, tiles }
}

export const mapDetail = {
  /**
   * A zone's detail: the worker's keypoints when kept, else the tiles (downloaded first if they
   * are not here yet). Null when they cannot be had: the zone map the app ships is used meanwhile.
   */
  get(key: string, cols: number, rows: number, col: number, row: number): Promise<MapDetail> {
    if (!isKey(key) || ![cols, rows, col, row].every(Number.isInteger) || col < 0 || row < 0 || col >= cols || row >= rows || !(cols >= 1 && cols <= 16 && rows >= 1 && rows <= 16)) return Promise.resolve(null)
    const group = `${key}-${col}-${row}`
    let job = pending.get(group)
    if (!job) {
      const legacy = join(dir(key), FEATURES)
      const features = join(dir(key), `features-v2-${col}-${row}.bin`)
      const whole = existsSync(legacy)
      job = (whole || existsSync(features)
        ? readFile(whole ? legacy : features).then((b): MapDetail => ({ kind: 'features', data: asBuffer(b), whole }))
        : download(key, cols, rows, col, row))
        .catch((err: unknown) => {
          glog(`no detail for ${key}: ${String(err)}`)
          return null
        })
        .finally(() => pending.delete(group))
      pending.set(group, job)
    }
    return job
  },

  /** What the worker made of the tiles, to load next time instead. */
  async saveFeatures(key: string, data: ArrayBuffer, col: number, row: number): Promise<void> {
    if (!isKey(key) || ![col, row].every((n) => Number.isInteger(n) && n >= 0 && n < 16) || !(data instanceof ArrayBuffer) || data.byteLength < 16) return
    const file = join(dir(key), `features-v2-${col}-${row}.bin`)
    await mkdir(dir(key), { recursive: true })
    const tmp = `${file}.${randomUUID()}.part`
    await writeFile(tmp, Buffer.from(data))
    await rename(tmp, file)
    glog(`${key}'s detail kept (${(data.byteLength / 1_048_576).toFixed(1)} MB of keypoints)`)
  },
}
