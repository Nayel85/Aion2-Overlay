/**
 * The game's item icons the app does not bundle (the lesser equipment's, the usable items': too many
 * to ship), for the windows as `itemicon://icon/<path>.webp` (shared/sessions.ts itemIcon): fetched
 * from questlog.gg's CDN the first time one is shown, then kept in `<userData>/icons`. The windows
 * have no network (index.ts blockNetwork): this, in the main process, is their one way to an icon,
 * and only to that CDN's item textures.
 */
import { app, protocol } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { log } from './tracker.ts'

const SCHEME = 'itemicon'
const CDN = 'https://cdn.questlog.gg/aion-2/assets/Game/UI/Resource/Texture/'
/** An icon's path: Texture's folders and its name, nothing else (no `..`, no host). */
const PATH = /^[A-Za-z0-9_]+(\/[A-Za-z0-9_-]+)+$/
/** A path the CDN did not have: not asked again this run. */
const missing = new Set<string>()

/** Before the app is ready: the scheme loads like a file (images, the CSP's img-src). */
export function registerIconScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/** Once ready: answer the windows' icons from the cache, else from the CDN (then cached). */
export function startIcons(): void {
  const cache = join(app.getPath('userData'), 'icons')
  protocol.handle(SCHEME, async (req) => {
    const path = decodeURIComponent(new URL(req.url).pathname).replace(/^\//, '').replace(/\.webp$/, '')
    if (!PATH.test(path) || missing.has(path)) return new Response(null, { status: 404 })
    const file = join(cache, `${path}.webp`)
    try {
      if (!existsSync(file)) {
        const res = await fetch(`${CDN}${path}.webp`)
        if (!res.ok) {
          missing.add(path)
          log(`icons: ${path}: HTTP ${res.status}`)
          return new Response(null, { status: 404 })
        }
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, Buffer.from(await res.arrayBuffer()))
      }
      return new Response(readFileSync(file), { headers: { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000' } })
    } catch (err) {
      log(`icons: ${path}: ${String(err)}`)
      return new Response(null, { status: 502 })
    }
  })
}
