/**
 * What the stats views (Loot, Crafts, Gathering, Past sessions) share: the sessions kept, the period
 * picked and since when it counts, and the characters picked (none picked: all of them).
 */
import { computed, type ComputedRef } from 'vue'
import { ASCENSION } from '@shared/characters.ts'
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
  return computed(() => store.allSessions)
}

