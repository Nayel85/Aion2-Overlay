/**
 * What every overlay's page does the same way (main/windows.ts OVERLAYS opens, shows and places
 * their windows alike): it measures what it shows and tells main, which sizes the window to it and
 * shows it, or hides it at 0 × 0; it knows when it is being placed (the dashboard up, or the pets
 * HUD moved by hand), to show its sample; and it is dragged by its header.
 *
 * The page marks what it shows with `ref="root"` (found here, the page need not hold it).
 *
 * `shows`: whether it has anything to show now; measured as 0 × 0 when not (its root may keep a
 * margin or an empty frame).
 */
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch, type ComputedRef, type ShallowRef } from 'vue'
import type { OverlayId } from '@shared/ipc.ts'
import { useApp } from '@/stores/app.ts'
import { bridge } from './bridge.ts'
import { windowDrag } from './windowDrag.ts'

export function useOverlay(
  id: OverlayId,
  shows: () => boolean = () => true,
): { root: Readonly<ShallowRef<HTMLElement | null>>; placing: ComputedRef<boolean>; report: () => void; drag: ReturnType<typeof windowDrag> } {
  const store = useApp()
  const api = bridge()
  // The page's element with ref="root": what is measured.
  const root = useTemplateRef<HTMLElement>('root')
  /** Being placed: shown with its sample, at its real size, to be dragged into place. */
  const placing = computed(() => store.panelVisible || (id === 'hud' && store.hudEditing))
  let sent = ''
  function report(): void {
    const el = root.value
    const r = el && shows() ? el.getBoundingClientRect() : { width: 0, height: 0 }
    const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
    if (key === sent) return
    sent = key
    void api.invoke('overlay:resize', id, { width: r.width, height: r.height })
  }
  let observer: ResizeObserver | null = null
  onMounted(() => {
    observer = new ResizeObserver(report)
    if (root.value) observer.observe(root.value)
    report()
  })
  onBeforeUnmount(() => observer?.disconnect())
  // Placed or not: its sample comes or goes, measured again.
  watch(placing, () => void nextTick(report))
  return { root, placing, report, drag: windowDrag({ overlay: id }) }
}
