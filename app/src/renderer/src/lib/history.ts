/** A page of saved fights (Combat history, Personal bests): loaded as it opens, again whenever the history changes. */
import { onBeforeUnmount, onMounted } from 'vue'
import { bridge } from './bridge.ts'

export function onHistory(load: () => Promise<void> | void): void {
  let off: (() => void) | null = null
  onMounted(() => {
    void load()
    off = bridge().on('history:changed', () => void load())
  })
  onBeforeUnmount(() => off?.())
}
