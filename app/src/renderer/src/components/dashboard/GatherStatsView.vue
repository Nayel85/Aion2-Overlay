<script setup lang="ts">
// The gatherings over the sessions kept (shared/gatherStats.ts): picked by character, since when and
// resource, then by character and resource: how many, failed, ranked up, a plant's x3, doubled
// against what Plentiful Harvest's level makes expected (your luck), Lady Luck's triggers, and the
// skills' levels the rolls showed. The filters picked are remembered (this window's storage).
import { classOf, fromOf, namePicker, type Period, PERIODS, useSessions } from '@/lib/statsFilters.ts'
import { useStored } from '@/lib/now.ts'
import { computed, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import Segmented from '@/components/ui/Segmented.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { allGatherings, filterGatherings, gatherResources, gatherRows, gatherTotal } from '@shared/gatherStats.ts'
import { luck } from '@shared/lootStats.ts'
import { itemIcon } from '@shared/sessions.ts'

/** `details`: the x2 Plentiful Harvest makes expected, your luck, Lady Luck's triggers, the skills seen. */
defineProps<{ details?: boolean }>()

interface Saved {
  names: string[]
  period: Period
  resource: number | null
}
/** The filters picked, remembered in this window's storage. */
const NO_FILTERS: Saved = { names: [], period: 'all', resource: null }
const f = useStored<Saved>('gatherStats.filters', NO_FILTERS, (raw) => ({ ...NO_FILTERS, ...(raw as Partial<Saved>) }))

const sessions = useSessions()
const all = computed(() => allGatherings(sessions.value))
const characters = computed(() => [...new Set(all.value.map((g) => g.name))])
const resources = computed(() => gatherResources(filterGatherings(all.value, { names: f.value.names, from: fromOf(f.value.period), resource: null })))
const resourceOptions = computed(() => [{ id: 0, label: t('All resources') }, ...resources.value.map(([id, name, n]) => ({ id, label: `${name} (${n})` }))])
const picked = computed(() => filterGatherings(all.value, { names: f.value.names, from: fromOf(f.value.period), resource: f.value.resource }))
const rows = computed(() => gatherRows(picked.value))
const total = computed(() => gatherTotal(picked.value))

const { toggleName, picked: isPicked } = namePicker(f, characters)
const className = (name: string): string | null => classOf(sessions.value, name)

const pct = (n: number, of: number): string => (of ? `${Math.round((n / of) * 100)}%` : '–')
function luckOf(got: number, expected: number | null): { text: string; class: string } | null {
  const l = expected === null ? null : luck(got, expected)
  if (l === null) return null
  return { text: `×${l.toFixed(2)}`, class: l >= 1.1 ? 'text-green' : l <= 0.9 ? 'text-red' : 'text-dark' }
}
</script>

<template>
  <div>
    <!-- The filters. -->
    <div class="mb-5 space-y-3 rounded-xl border border-card p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-xs text-darker">{{ t('Characters') }}</span>
        <button
          v-for="name in characters"
          :key="name"
          type="button"
          :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', isPicked(name) ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
          @click="toggleName(name)"
        >
          <ClassIcon :class-name="className(name)" :size="14" />{{ name }}
        </button>
        <button v-if="f.names.length" type="button" class="text-xs text-darker hover:text-default hover:underline" @click="f.names = []">{{ t('All') }}</button>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-xs text-darker">{{ t('Period') }}</span>
        <Segmented v-model="f.period" size="sm" :options="PERIODS" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-xs text-darker">{{ t('Resource') }}</span>
        <SelectBox :model-value="f.resource ?? 0" size="sm" :options="resourceOptions" @update:model-value="(v) => (f.resource = v || null)" />
      </div>
    </div>

    <div v-if="!total.done" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ all.length ? t('No gatherings match.') : t('No gatherings yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each gathering counts once the overlay has seen it, from this version on.') }}</div>
    </div>

    <div v-else class="overflow-x-auto rounded-xl border border-card">
      <table class="w-full text-sm tabular-nums">
        <thead>
          <tr class="text-xs text-darker">
            <th class="px-4 py-2 text-left font-normal" />
            <th class="px-3 py-2 text-left font-normal">{{ t('Resource') }}</th>
            <th class="px-3 py-2 text-center font-normal">{{ t('Gatherings') }}</th>
            <th class="px-3 py-2 text-center font-normal text-red">{{ t('Failed') }}</th>
            <th class="px-3 py-2 text-center font-normal text-green">{{ t('Rank up') }}</th>
            <th class="px-3 py-2 text-center font-normal">x3</th>
            <th class="px-3 py-2 text-center font-normal text-yellow">x2</th>
            <template v-if="details">
              <th class="px-3 py-2 text-center font-normal">{{ t('Your luck') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Lady Luck') }}</th>
              <th class="px-3 py-2 text-left font-normal">{{ t('Skills seen') }}</th>
            </template>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="`${r.name}-${r.resource}`" class="border-t border-card">
            <td class="px-4 py-1.5"><span class="flex items-center gap-1.5"><ClassIcon :class-name="className(r.name)" :size="16" />{{ r.name }}</span></td>
            <td class="px-3 py-1.5">
              <span class="flex items-center gap-1.5">
                <img v-if="itemIcon(r.icon)" :src="itemIcon(r.icon)!" alt="" class="size-5 rounded-sm" draggable="false" />{{ r.resourceName }}
              </span>
            </td>
            <td class="px-3 py-1.5 text-center">{{ r.done }}</td>
            <td class="px-3 py-1.5 text-center text-red">{{ r.failed }} <span class="text-[11px] text-darker">{{ pct(r.failed, r.done) }}</span></td>
            <td class="px-3 py-1.5 text-center text-green">{{ r.rankUps || '–' }} <span v-if="r.rankUps" class="text-[11px] text-darker">{{ pct(r.rankUps, r.done - r.failed) }}</span></td>
            <td class="px-3 py-1.5 text-center">{{ r.multiplied || '–' }} <span v-if="r.multiplied" class="text-[11px] text-darker">{{ pct(r.multiplied, r.done - r.failed) }}</span></td>
            <td class="px-3 py-1.5 text-center text-yellow">
              {{ r.doubled || '–' }} <span v-if="r.doubled" class="text-[11px] text-darker">{{ pct(r.doubled, r.done - r.failed) }}</span>
              <div v-if="details && r.expectedDoubled !== null" class="text-[10px] text-darker">{{ t('expected {n}', { n: r.expectedDoubled.toFixed(1) }) }}</div>
            </td>
            <template v-if="details">
              <td class="px-3 py-1.5 text-center">
                <span v-if="luckOf(r.doubled, r.expectedDoubled)" :class="luckOf(r.doubled, r.expectedDoubled)!.class">{{ luckOf(r.doubled, r.expectedDoubled)!.text }}</span>
                <span v-else class="text-darker">–</span>
              </td>
              <td class="px-3 py-1.5 text-center">{{ r.luck || '–' }}</td>
              <td class="px-3 py-1.5 text-xs text-dark">
                <span v-for="[name, level] in r.skills" :key="name" class="mr-2 whitespace-nowrap">{{ t(name) }} <span class="text-default">{{ t('Lv. {n}', { n: level }) }}</span></span>
              </td>
            </template>
          </tr>
          <tr v-if="rows.length > 1" class="border-t border-card bg-card/40 font-semibold">
            <td class="px-4 py-2" colspan="2">{{ t('All') }}</td>
            <td class="px-3 py-2 text-center">{{ total.done }}</td>
            <td class="px-3 py-2 text-center text-red">{{ total.failed }} <span class="text-[11px] font-normal text-darker">{{ pct(total.failed, total.done) }}</span></td>
            <td class="px-3 py-2 text-center text-green">{{ total.rankUps }} <span class="text-[11px] font-normal text-darker">{{ pct(total.rankUps, total.done - total.failed) }}</span></td>
            <td class="px-3 py-2 text-center">{{ total.multiplied }} <span class="text-[11px] font-normal text-darker">{{ pct(total.multiplied, total.done - total.failed) }}</span></td>
            <td class="px-3 py-2 text-center text-yellow">{{ total.doubled }} <span class="text-[11px] font-normal text-darker">{{ pct(total.doubled, total.done - total.failed) }}</span></td>
            <template v-if="details">
              <td class="px-3 py-2" />
              <td class="px-3 py-2 text-center">{{ total.luck }}</td>
              <td class="px-3 py-2" />
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="details" class="mt-3 text-xs text-darker">{{ t('x2: Plentiful Harvest, its chance taken as 10% a level (30% at Lv. 3, the game says), on every success; its level shows once it has fired. Skills seen: those the rolls fired, at their level, for each character.') }}</p>
  </div>
</template>
