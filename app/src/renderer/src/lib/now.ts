/**
 * The time now, ticking every `everyMs` while `active()` says the window shows something that moves
 * (a countdown, a gauge): idle otherwise, so a window with nothing to show draws nothing. Stopped with
 * the component.
 */
import { getCurrentInstance, onBeforeUnmount, ref, watch, type Ref } from 'vue'

export function useNow(everyMs: number, active: () => boolean = () => true): Ref<number> {
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  const stop = (): void => {
    if (timer) clearInterval(timer)
    timer = null
  }
  watch(
    active,
    (on) => {
      if (on && !timer) {
        now.value = Date.now()
        timer = setInterval(() => (now.value = Date.now()), everyMs)
      } else if (!on) stop()
    },
    { immediate: true },
  )
  if (getCurrentInstance()) onBeforeUnmount(stop)
  return now
}

/**
 * A value kept in this window's storage (a filter, a tab), read once and written as it changes. The
 * storage can be missing (a private window, blocked): the value then lasts only this time.
 */
export function useStored<T>(key: string, fallback: T, read: (raw: unknown) => T = (raw) => raw as T): Ref<T> {
  let start = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      // Kept before as plain text ('characters', '1'): read as such.
      let parsed: unknown = raw
      try {
        parsed = JSON.parse(raw)
      } catch {
        // Plain text.
      }
      start = read(parsed)
    }
  } catch {
    // Unreadable: the fallback.
  }
  const value = ref(start) as Ref<T>
  watch(
    value,
    (v) => {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        // Storage unavailable: only for this time.
      }
    },
    { deep: true },
  )
  return value
}
