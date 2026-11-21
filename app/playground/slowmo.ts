// For the recorder: ?slow=0.25 runs the page at a quarter of its speed (timers, Date.now, and the CSS
// animations and transitions), so a browser that can only take ~9 screenshots a second still records
// a smooth 30 fps video once the times are scaled back up. ?at=2026-11-20T11:52:00Z starts the page's
// clock at that time (so an event is 8 minutes away). Without either it does nothing.
const scale = Number(new URLSearchParams(location.search).get('slow')) || 1

const at = new URLSearchParams(location.search).get('at')
const startAt = at ? Date.parse(at) : NaN

if (scale !== 1 || !Number.isNaN(startAt)) {
  const realNow = Date.now.bind(Date)
  const realPerf = performance.now.bind(performance)
  const t0 = realNow()
  const p0 = realPerf()
  const base = Number.isNaN(startAt) ? t0 : startAt
  Date.now = () => base + (realNow() - t0) * scale
  performance.now = () => p0 + (realPerf() - p0) * scale
  const timeout = window.setTimeout.bind(window)
  const interval = window.setInterval.bind(window)
  window.setTimeout = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => timeout(fn, ms / scale, ...args)) as typeof window.setTimeout
  window.setInterval = ((fn: TimerHandler, ms = 0, ...args: unknown[]) => interval(fn, ms / scale, ...args)) as typeof window.setInterval
  const slow = (e: Event): void => (e.target as Element | null)?.getAnimations?.().forEach((a) => (a.playbackRate = scale))
  for (const type of ['animationstart', 'transitionrun']) document.addEventListener(type, slow, true)
}

export const timeScale = scale
