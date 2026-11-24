<script setup lang="ts">
// Each character's expeditions (shared/expeditions.ts): by dungeon and mode, the cubes opened toward
// its guaranteed chest of how many it takes, and how many runs are left; one whose chest is due stands
// out. As the game said at the character's last login, and counted on with each cube opened since.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useStored } from '@/lib/now.ts'
import { useApp } from '@/stores/app.ts'
import { EXPEDITION_MODES, expeditionRows, type Expeditions } from '@shared/expeditions.ts'

const store = useApp()
const state = ref<Expeditions>({})
let off: (() => void) | null = null
onMounted(async () => {
  off = bridge().on('expeditions:changed', (s) => (state.value = s))
  state.value = await bridge().invoke('expeditions:get')
})
onBeforeUnmount(() => off?.())

/** The characters known, the latest first; the one picked, remembered. */
const characters = computed(() => Object.entries(state.value).sort((a, b) => b[1].at - a[1].at))
const who = useStored<string | null>('expeditions.who', null, (raw) => (typeof raw === 'string' ? raw : null))
const picked = computed(() => characters.value.find(([id]) => id === who.value) ?? characters.value[0] ?? null)
const rows = computed(() => (picked.value ? expeditionRows(picked.value[1].cubes) : []))
const className = (id: string): string | null => store.characters[id]?.className ?? null
const when = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div>
    <PageHeader
      title="Expeditions"
      about="Each cube you open at the end of an expedition counts toward its guaranteed chest (a pick from the dungeon's set): how many you have opened, of how many it takes, by dungeon and mode. As the game says when you log in, counted on with each cube since."
    />

    <div v-if="!characters.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No expedition yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('With the overlay open, log in with a character: its expeditions show here.') }}</div>
    </div>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button
          v-for="[id, c] in characters"
          :key="id"
          type="button"
          :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', picked?.[0] === id ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
          @click="who = id"
        >
          <ClassIcon :class-name="className(id)" :size="14" />{{ c.name }}
        </button>
        <span v-if="picked" class="text-xs text-darker">{{ t('As of {when}', { when: when(picked[1].at) }) }}</span>
      </div>

      <p v-if="!rows.length" class="rounded-xl border border-card px-4 py-6 text-center text-xs text-darker">{{ t('No expedition run yet on this character.') }}</p>
      <div v-else class="overflow-hidden rounded-xl border border-card">
        <table class="w-full text-sm">
          <thead class="bg-card text-xs text-darker">
            <tr>
              <th class="px-3 py-2 text-left font-medium">{{ t('Expedition') }}</th>
              <th v-for="m in EXPEDITION_MODES" :key="m.id" class="px-3 py-2 text-left font-medium">{{ t(m.label) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.name" class="border-t border-card">
              <td class="px-3 py-2 font-medium">{{ r.name }}</td>
              <td v-for="m in EXPEDITION_MODES" :key="m.id" class="px-3 py-2">
                <template v-if="r.modes[m.id]">
                  <div class="flex items-baseline gap-2 tabular-nums">
                    <span :class="r.modes[m.id]!.left ? 'font-semibold' : 'font-semibold text-green'">{{ r.modes[m.id]!.cubes }} / {{ r.modes[m.id]!.ceiling }}</span>
                    <span v-if="r.modes[m.id]!.left" class="text-xs text-darker">{{ plural(r.modes[m.id]!.left, '{n} run to go', '{n} runs to go') }}</span>
                    <span v-else class="text-xs font-semibold text-green">{{ t('Guaranteed chest due') }}</span>
                  </div>
                  <div class="mt-1 h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-dark">
                    <div :class="['h-full rounded-full', r.modes[m.id]!.left ? 'bg-accent' : 'bg-green']" :style="{ width: `${Math.min(100, (r.modes[m.id]!.cubes / r.modes[m.id]!.ceiling) * 100)}%` }" />
                  </div>
                </template>
                <span v-else class="text-darkest">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-darker">{{ t('Each cube opened counts once (the second cube of the membership may not); the next login sets it as the game counts it.') }}</p>
    </template>
  </div>
</template>
