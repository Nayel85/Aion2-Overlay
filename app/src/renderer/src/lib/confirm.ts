// An action that asks once (a delete, a reset): the first click arms it for a few seconds (the button
// shows it, `armed`), the second one acts. Every such button uses it.
import { ref, type Ref } from 'vue'

const ARMED_MS = 3000

export function useArmed(): { armed: Ref<string | null>; confirmThen: (key: string, act: () => void) => void } {
  const armed = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  function confirmThen(key: string, act: () => void): void {
    if (timer) clearTimeout(timer)
    if (armed.value !== key) {
      armed.value = key
      timer = setTimeout(() => (armed.value = null), ARMED_MS)
      return
    }
    armed.value = null
    act()
  }
  return { armed, confirmThen }
}
