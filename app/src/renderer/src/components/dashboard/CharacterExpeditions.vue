<script setup lang="ts">
// A server's characters' expeditions (shared/expeditions.ts), side by side: a row per expedition, a
// column per character, and in each cell its three modes (Exploration, Conquest Normal and Hard) as the
// cubes opened of the guaranteed chest's ceiling, a bar each; a chest due stands out in green. As the
// game said at each one's last login, counted on with each cube since.
import { computed } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import { plural, t } from '@/lib/i18n.ts'
import { EXPEDITION_MODES, expeditionCell, shownExpeditions, type Expeditions } from '@shared/expeditions.ts'

const props = defineProps<{ characters: { id: string; name: string; className: string | null }[]; state: Expeditions }>()
const names = computed(() => shownExpeditions(props.state))
const known = computed(() => props.characters.filter((c) => props.state[c.id]))
function title(name: string, mode: string, cell: { cubes: number | null; ceiling: number; left: number | null }): string {
  if (cell.cubes === null) return `${name} · ${t(mode)}: ${t('not listed by the game yet')}`
  return `${name} · ${t(mode)}: ${cell.cubes} / ${cell.ceiling} · ${cell.left ? plural(cell.left, '{n} run to go', '{n} runs to go') : t('Guaranteed chest due')}`
}
</script>

<template>
  <div v-if="known.length" class="mt-4 overflow-hidden rounded-xl border border-card">
    <div class="flex items-baseline gap-2 border-b border-card bg-card px-4 py-2">
      <span class="text-xs font-medium uppercase tracking-wide text-darker">{{ t('Expeditions') }}</span>
      <span class="text-[11px] text-darkest">{{ t('cubes opened toward the guaranteed chest') }}</span>
    </div>
    <table class="w-full text-xs">
      <thead class="text-darker">
        <tr class="border-b border-card">
          <th class="py-2 pl-4 text-left font-medium">{{ t('Expedition') }}</th>
          <th v-for="c in known" :key="c.id" class="px-3 text-center font-medium">
            <span class="inline-flex items-center gap-1.5"><ClassIcon :class-name="c.className" :size="16" />{{ c.name }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="name in names" :key="name" class="border-b border-card last:border-b-0">
          <td class="py-2 pl-4 align-top font-medium text-default">{{ name }}</td>
          <td v-for="c in known" :key="c.id" class="px-3 py-1.5">
            <div class="mx-auto w-fit space-y-0.5">
              <template v-for="m in EXPEDITION_MODES" :key="m.id">
                <div v-if="expeditionCell(state[c.id]?.cubes, name, m.id)" class="flex items-center gap-1.5 tabular-nums" :title="title(name, m.label, expeditionCell(state[c.id]?.cubes, name, m.id)!)">
                  <span class="w-10 shrink-0 text-[10px] text-darkest">{{ t(m.short) }}</span>
                  <template v-for="cell in [expeditionCell(state[c.id]?.cubes, name, m.id)!]" :key="0">
                    <div class="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-dark">
                      <div v-if="cell.cubes !== null" :class="['h-full rounded-full', cell.left ? 'bg-accent' : 'bg-green']" :style="{ width: `${Math.min(100, (cell.cubes / cell.ceiling) * 100)}%` }" />
                    </div>
                    <span v-if="cell.cubes === null" class="text-darkest">– / {{ cell.ceiling }}</span>
                    <span v-else :class="cell.left ? '' : 'font-semibold text-green'">{{ cell.cubes }} / {{ cell.ceiling }}<template v-if="!cell.left"> ✓</template></span>
                  </template>
                </div>
              </template>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
