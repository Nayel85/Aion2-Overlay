/**
 * A grey picture of a display, as the screen watchers look at it (shopScreen.ts, dutyScreen.ts): the
 * whole display shrunk to `width` × `height` spots, its top `band` share only if asked, each spot's
 * grey 0-255, and -1 where a `hole` is (this app's own windows: what is under them is not the game's).
 */
import { desktopCapturer, type Display, type Rectangle } from 'electron'

export interface GreyPicture {
  width: number
  height: number
  spots: Int16Array
}

export async function screenGrey(display: Display, size: { width: number; height: number }, holes: Rectangle[], band = 1): Promise<GreyPicture | null> {
  const { width, height } = size
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: width * 2, height: height * 2 } })
  const shot = (sources.find((s) => s.display_id === String(display.id)) ?? sources[0])?.thumbnail
  if (!shot || shot.isEmpty()) return null
  const bgra = shot.resize({ width, height, quality: 'good' }).toBitmap()
  if (bgra.length !== width * height * 4) return null
  const b = display.bounds
  const rows = Math.max(1, Math.round(height * band))
  // A spot's worth around each hole too: the spots its edge cuts through change with it.
  const padX = b.width / width
  const padY = b.height / height
  const spots = new Int16Array(width * rows)
  for (let y = 0; y < rows; y++) {
    const sy = b.y + ((y + 0.5) * b.height) / height
    for (let x = 0; x < width; x++) {
      const sx = b.x + ((x + 0.5) * b.width) / width
      const inHole = holes.some((h) => sx >= h.x - padX && sx < h.x + h.width + padX && sy >= h.y - padY && sy < h.y + h.height + padY)
      const i = (y * width + x) * 4
      spots[y * width + x] = inHole ? -1 : Math.round(0.114 * bgra[i]! + 0.587 * bgra[i + 1]! + 0.299 * bgra[i + 2]!)
    }
  }
  return { width, height: rows, spots }
}
