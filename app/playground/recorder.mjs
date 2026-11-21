// The recorder behind the promo videos (record-promo.mjs, record-hud.mjs).
// It starts Chromium headless on its own profile, opens a playground page (npm run playground must be
// up) and records screenshots, each with the time it was taken, while the story moves a real mouse over
// it (DevTools input, so the HUD hovers and clicks as it does in game). The page runs at a fraction of
// its speed (slowmo.ts) so a browser that takes ~9 screenshots a second still gives a smooth 30 fps.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)

/**
 * @param {{ url: (slow: number) => string, out: string, slow?: number, fps?: number, width?: number, height?: number,
 *   clip?: { x: number, y: number, width: number, height: number } | null, scaleTo?: number | null, quality?: number }} o
 */
export async function startRecording(o) {
  const SLOW = o.slow ?? Number(process.env.SLOW ?? 0.25)
  const FPS = o.fps ?? 30
  const W = o.width ?? 1920
  const H = o.height ?? 1080
  const frames = join(tmpdir(), 'lokthar-promo-frames')
  rmSync(frames, { recursive: true, force: true })
  mkdirSync(frames, { recursive: true })
  mkdirSync(dirname(o.out), { recursive: true })

  const port = 9333
  // The binary itself with its own profile, so it never touches a browser you have open.
  const chrome = spawn(process.env.CHROMIUM ?? '/usr/lib/chromium/chromium', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), 'lokthar-promo-profile')}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' })
  let pageWs = null
  for (let i = 0; i < 50 && !pageWs; i++) {
    await sleep(200)
    try { pageWs = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl } catch { /* not up yet */ }
  }
  if (!pageWs) throw new Error('Chromium did not start')
  const ws = new WebSocket(pageWs)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const waiters = new Map()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pending.has(msg.id)) { const { ok, bad } = pending.get(msg.id); pending.delete(msg.id); msg.error ? bad(new Error(msg.error.message)) : ok(msg.result) }
    else if (msg.method && waiters.has(msg.method)) { waiters.get(msg.method)(msg.params); waiters.delete(msg.method) }
  }
  const cdp = (method, params = {}) => new Promise((ok, bad) => { const n = ++id; pending.set(n, { ok, bad }); ws.send(JSON.stringify({ id: n, method, params })) })
  const once = (method) => new Promise((r) => waiters.set(method, r))
  const evaluate = async (expression) => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value

  await cdp('Page.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  const loaded = once('Page.loadEventFired')
  await cdp('Page.navigate', { url: o.url(SLOW) })
  await loaded
  for (let i = 0; i < 100 && !(await evaluate('!!window.promo')); i++) await sleep(100)
  await sleep(1500) // fonts and the screenshot

  // Screenshots as fast as the browser gives them, each with the time it was taken: video time is what
  // the page lived through, not what the clock on the wall said.
  const shots = []
  let recording = true
  const startedAt = Date.now()
  const grabber = (async () => {
    while (recording) {
      const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: o.quality ?? 92, optimizeForSpeed: true, ...(o.clip ? { clip: { ...o.clip, scale: 1 } } : {}) })
      const at = Date.now()
      const file = join(frames, `f${String(shots.length).padStart(5, '0')}.jpg`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      shots.push({ file, at: ((at - startedAt) / 1000) * SLOW })
    }
  })()

  let mouse = { x: W - 200, y: H / 2 }
  const wait = (s) => sleep((s * 1000) / SLOW)
  const mouseTo = (x, y, buttons = 0) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons })
  async function glide(x, y, s = 0.7) {
    const from = { ...mouse }
    const start = Date.now()
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / ((s * 1000) / SLOW))
      const k = ease(t)
      await mouseTo(from.x + (x - from.x) * k, from.y + (y - from.y) * k)
      if (t >= 1) break
      await sleep(4)
    }
    mouse = { x, y }
  }
  async function click() {
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: mouse.x, y: mouse.y, button: 'left', buttons: 1, clickCount: 1 })
    await wait(0.12)
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', buttons: 0, clickCount: 1 })
  }
  const rectOf = (selector) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
  const button = (label) => rectOf(`button[aria-label="${label}"]`)
  async function toButton(label, s = 0.6) {
    const at = await button(label)
    if (!at) throw new Error(`no button ${label}`)
    await glide(at.x, at.y, s)
  }
  const call = (js) => evaluate(`window.promo.${js}`)

  async function finish() {
    recording = false
    await grabber
    ws.close()
    chrome.kill()
    // Each frame stays until the next one was taken: a constant 30 fps from the screenshots.
    const list = shots.map((f, i) => `file '${f.file}'\nduration ${(shots[i + 1] ? shots[i + 1].at - f.at : 0.05).toFixed(4)}`).join('\n')
    const listFile = join(frames, 'list.txt')
    writeFileSync(listFile, `${list}\nfile '${shots.at(-1).file}'\n`)
    console.log(`${shots.length} screenshots over ${shots.at(-1).at.toFixed(1)} s of video`)
    const filters = [`fps=${FPS}`, ...(o.scaleTo ? [`scale=${o.scaleTo}:-2:flags=lanczos`] : [])].join(',')
    await new Promise((ok, bad) => {
      const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', filters, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', '-an', o.out], { stdio: 'inherit' })
      ff.on('exit', (c) => (c === 0 ? ok() : bad(new Error(`ffmpeg ${c}`))))
    })
    console.log(`${o.out}: ${(statSync(o.out).size / 1e6).toFixed(1)} MB`)
  }

  console.log('recording')
  return { wait, glide, click, mouseTo, rectOf, button, toButton, evaluate, call, finish, mouse: () => mouse }
}
