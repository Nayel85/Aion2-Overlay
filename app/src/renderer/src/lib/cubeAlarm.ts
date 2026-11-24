/**
 * The Hidden Cube alarm: a sound when a cube comes into view (settings.cubes, set on the Map page),
 * once per cube, whatever overlay is open: the bubble sounds it, as it does the timers' chime.
 */
import { watch } from 'vue'
import { playSound } from '@/lib/sound.ts'
import { useApp } from '@/stores/app.ts'

export function useCubeAlarm(): void {
  const store = useApp()
  const heard = new Set<number>()
  watch(
    () => store.cubes,
    (list) => {
      const fresh = list.filter((c) => !heard.has(c.id))
      for (const c of fresh) heard.add(c.id)
      const cfg = store.settings.cubes
      if (fresh.length && store.ready && cfg.sound) void playSound('cube', cfg.soundId, cfg.volume)
    },
  )
}
