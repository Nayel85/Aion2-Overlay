<script setup lang="ts">
// A record's value, a DPS or a time, as a link to its fight (lib/fights.ts useOpenFight: in the page that
// shows fights itself, else in the fight's own window): every place a record is shown. Without its fight
// (none kept), the value alone.
import { computed } from 'vue'
import { useOpenFight } from '@/lib/fights.ts'
import { compact, duration } from '@shared/format.ts'

const props = defineProps<{ value: number; as: 'dps' | 'time'; fight?: string | null; title?: string }>()
const openFight = useOpenFight()
const text = computed(() => (props.as === 'dps' ? compact(props.value) : duration(props.value)))
</script>

<template>
  <button v-if="fight" type="button" class="font-semibold text-yellow tabular-nums hover:underline" :title="title" @click.stop="openFight(fight)">{{ text }}</button>
  <span v-else class="font-semibold text-yellow tabular-nums" :title="title">{{ text }}</span>
</template>
