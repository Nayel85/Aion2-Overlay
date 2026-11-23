<script setup lang="ts">
// One item as the game shows it in its windows: its icon on its grade's colour, its enchantment
// (+5) and its count in the corner; an empty slot dimmed. Hovered, it tells the page (`hover`), which
// shows its details.
import { computed } from 'vue'
import { ICON } from '@/components/panel/sessionIcons.ts'
import type { SlotItem } from '@shared/inventory.ts'
import { itemIcon, itemInfo } from '@shared/sessions.ts'

const props = defineProps<{ slotItem: SlotItem | null; size?: number }>()
const emit = defineEmits<{ hover: [item: SlotItem | null, at: { x: number; y: number }] }>()

const info = computed(() => (props.slotItem ? itemInfo(props.slotItem.item) : undefined))
const icon = computed(() => itemIcon(info.value?.icon))
/** The game's tile colours: white, green, blue, gold, orange (Legendary and up). */
const tone = computed(() => {
  const g = info.value?.grade ?? 0
  if (!props.slotItem) return 'bg-dark/40 ring-dark'
  if (g >= 71) return 'bg-gradient-to-b from-accent/40 to-accent/10 ring-accent/50'
  if (g >= 51) return 'bg-gradient-to-b from-orange/45 to-orange/10 ring-orange/50'
  if (g >= 41) return 'bg-gradient-to-b from-yellow/45 to-yellow/10 ring-yellow/50'
  if (g >= 31) return 'bg-gradient-to-b from-blue/45 to-blue/10 ring-blue/50'
  if (g >= 21) return 'bg-gradient-to-b from-green/40 to-green/10 ring-green/40'
  return 'bg-gradient-to-b from-light/40 to-dark/40 ring-light'
})
const px = computed(() => `${props.size ?? 52}px`)
</script>

<template>
  <div
    :class="['relative shrink-0 overflow-hidden rounded-md ring-1', tone]"
    :style="{ width: px, height: px }"
    @mouseenter="(e) => emit('hover', slotItem, { x: e.clientX, y: e.clientY })"
    @mousemove="(e) => slotItem && emit('hover', slotItem, { x: e.clientX, y: e.clientY })"
    @mouseleave="(e) => emit('hover', null, { x: e.clientX, y: e.clientY })"
  >
    <template v-if="slotItem">
      <img v-if="icon" :src="icon" alt="" class="absolute inset-0 size-full object-contain p-0.5" draggable="false" loading="lazy" />
      <svg v-else viewBox="0 0 16 16" class="absolute inset-2 text-darker" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path :d="ICON.box" /></svg>
      <span v-if="slotItem.enchant" class="absolute bottom-0 right-0.5 text-[11px] font-bold tabular-nums text-white [text-shadow:0_0_3px_#000,0_0_2px_#000]">+{{ slotItem.enchant }}</span>
      <span v-else-if="slotItem.amount > 1" class="absolute bottom-0 right-0.5 text-[10px] font-semibold tabular-nums text-white [text-shadow:0_0_3px_#000,0_0_2px_#000]">{{ slotItem.amount >= 10_000 ? `${Math.round(slotItem.amount / 1000)}k` : slotItem.amount }}</span>
    </template>
  </div>
</template>
