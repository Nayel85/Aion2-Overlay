<script setup lang="ts">
// A class's emblem, as the game draws it (assets/classes, from A2Tools DPS Meter, GPL-3.0), by the
// meter's class name; nothing for an unknown one. The meter and Details draw the same files.
import { computed } from 'vue'
import { classIconUrl } from '@/lib/format.ts'

const props = withDefaults(defineProps<{ className: string | null | undefined; size?: number }>(), { size: 16 })
const src = computed(() => classIconUrl(props.className))
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="className ?? ''"
    :title="className ?? ''"
    :width="size"
    :height="size"
    class="shrink-0 object-contain"
    draggable="false"
  />
</template>
