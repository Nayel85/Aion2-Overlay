/**
 * What the stats views (Loot, Crafts, Gathering, Past sessions) share: the sessions kept, the period
 * picked and since when it counts, and the characters picked (none picked: all of them).
 */
import { computed, type ComputedRef, type Ref } from 'vue'
import { ASCENSION, characterId } from '@shared/characters.ts'
import type { PlaySession } from '@shared/sessions.ts'
import { useApp } from '@/stores/app.ts'

export type Period = 'today' | 'week' | 'month' | 'all'
export const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: '30 days' },
  { id: 'all', label: 'All' },
]

/** Since when a period counts: today's midnight, the weekly reset (Wednesday 07:00 UTC), 30 days back. */
export function fromOf(p: Period, now = Date.now()): number {
  if (p === 'today') return new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()
  if (p === 'week') return Math.floor((now - ASCENSION.offset) / ASCENSION.every) * ASCENSION.every + ASCENSION.offset
  if (p === 'month') return now - 30 * 86_400_000
  return 0
}

/** Every session kept, the one going on first. */
export function useSessions(): ComputedRef<PlaySession[]> {
  const store = useApp()
  return computed(() => (store.sessions.current ? [store.sessions.current, ...store.sessions.history] : store.sessions.history))
}

/** The characters picked in `f.names` (none: all), out of `characters`. */
export function namePicker(f: Ref<{ names: string[] }>, characters: Ref<string[]>): { toggleName: (name: string) => void; picked: (name: string) => boolean } {
  return {
    toggleName(name) {
      const names = f.value.names.includes(name) ? f.value.names.filter((n) => n !== name) : [...f.value.names, name]
      f.value = { ...f.value, names: names.length === characters.value.length ? [] : names }
    },
    picked: (name) => !f.value.names.length || f.value.names.includes(name),
  }
}

/** A character's class, from the server its sessions name it on. */
export function classOf(sessions: PlaySession[], name: string): string | null {
  const s = sessions.find((x) => x.name === name)
  return s?.server != null ? (useApp().characters[characterId(s.server, name)]?.className ?? null) : null
}
