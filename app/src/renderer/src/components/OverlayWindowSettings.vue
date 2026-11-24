<script setup lang="ts">
// An overlay's window, the same rows on every overlay's page: its opacity, its size (those that
// scale), hidden while idle (where it means something), and its place put back where it goes first.
// `setting`: the settings holding its opacity, scale and idle; `overlay`: its window (main/windows.ts).
import { computed } from 'vue'
import IdleHideRow from '@/components/IdleHideRow.vue'
import SettingRow from '@/components/SettingRow.vue'
import Slider from '@/components/Slider.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { percent } from '@shared/format.ts'
import type { OverlayId } from '@shared/ipc.ts'
import type { SettingKey } from '@shared/settings.ts'

const props = withDefaults(
  defineProps<{
    overlay: OverlayId
    setting: SettingKey
    /** Its opacity's lowest; none: no opacity row. */
    opacityMin?: number | null
    /** Its opacity's label: "Opacity", or "Background" where 0% leaves the text alone. */
    opacityLabel?: string
    opacityHint?: string
    /** Its size's range; none: it does not scale (its size is set apart, or by its corner). */
    scale?: [number, number] | null
    idle?: boolean
  }>(),
  { opacityMin: 0.3, opacityLabel: 'Opacity', opacityHint: undefined, scale: null, idle: false },
)

const store = useApp()
type Window = { opacity?: number; scale?: number; hideIdle?: boolean; idleSeconds?: number }
const cfg = computed(() => store.settings[props.setting] as unknown as Window)
const set = (patch: Partial<Window>): void => void store.set(props.setting, { ...(store.settings[props.setting] as object), ...patch } as never)
const reset = (): void => void bridge().invoke('overlay:resetPosition', props.overlay)
</script>

<template>
  <SettingRow v-if="opacityMin !== null && cfg.opacity !== undefined" :label="opacityLabel" :hint="opacityHint">
    <Slider :model-value="cfg.opacity" :min="opacityMin" :max="1" :step="0.05" :format="(v: number) => percent(v)" @update:model-value="set({ opacity: $event })" />
  </SettingRow>
  <SettingRow v-if="scale && cfg.scale !== undefined" label="Size">
    <Slider :model-value="cfg.scale" :min="scale[0]" :max="scale[1]" :step="0.05" :format="(v: number) => percent(v)" @update:model-value="set({ scale: $event })" />
  </SettingRow>
  <IdleHideRow v-if="idle && cfg.hideIdle !== undefined" :value="{ hideIdle: cfg.hideIdle, idleSeconds: cfg.idleSeconds ?? 30 }" @set="set" />
  <SettingRow label="Position" hint="Dragged into place while this window is open. This puts it back where it goes first.">
    <button type="button" class="rounded-md border border-light px-2.5 py-1 text-xs text-dark hover:bg-dark" @click="reset">{{ t('Reset') }}</button>
  </SettingRow>
</template>
