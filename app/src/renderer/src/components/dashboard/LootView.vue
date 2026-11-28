<script setup lang="ts">
// The dungeons' loot over the sessions kept (shared/lootStats.ts): the runs picked by character,
// since when, dungeon type and dungeon (with its mode), then what they gave by character (gold
// equipment, gold crafting materials, wings and artworks, Arcana cards, Kina) and by item (in all,
// a run's chance of it), per run, per cube or per hour in them; beside it, what the game's rates make
// of the same cubes, and your luck: what you got against that. The filters picked are remembered
// (this window's storage).
import CharName from '@/components/CharName.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { duration } from '@shared/format.ts'
import FilterRow from '@/components/FilterRow.vue'
import StatsFilters from '@/components/StatsFilters.vue'
import { fromOf, type Period, useSessions } from '@/lib/statsFilters.ts'
import { useStored } from '@/lib/now.ts'
import { computed, ref } from 'vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { plural, t } from '@/lib/i18n.ts'
import { formatKina } from '@shared/kina.ts'
import { filterRuns, itemStats, lootChoices, lootRuns, luck, summaries, summarize, unitsOf, type ItemFamily, type LootSummary, type LootUnit } from '@shared/lootStats.ts'
import { itemIcon, LOOT_KINDS } from '@shared/sessions.ts'
import { ICON, LOOT_KIND_STYLE } from '@/components/panel/sessionIcons.ts'
import { gradeClass } from '@/lib/grades.ts'
import LuckVerdict from '@/components/LuckVerdict.vue'
import { luckVerdict } from '@shared/luck.ts'

/** Inside the Stats page (StatsView): its header is the page's. */
/** `details`: what the drop rates make expected, your luck, the runs with an item. */
defineProps<{ embedded?: boolean; details?: boolean }>()

// ---- the filters, remembered ------------------------------------------------------------------

const UNITS: { id: LootUnit; label: string }[] = [
  { id: 'run', label: 'Per run' },
  { id: 'cube', label: 'Per cube' },
  { id: 'hour', label: 'Per hour' },
]
type Family = ItemFamily | 'gold' | 'all'
const FAMILIES: { id: Family; label: string }[] = [
  { id: 'gold', label: 'All gold' },
  { id: 'equipment', label: 'Gold equipment' },
  { id: 'craft', label: 'Gold materials' },
  { id: 'wings', label: 'Wings & artworks' },
  { id: 'cards', label: 'Arcana cards' },
  { id: 'all', label: 'All items' },
]
interface Saved {
  names: string[]
  period: Period
  kind: string | null
  world: number | null
  unit: LootUnit
  family: Family
}
/** The filters picked, remembered in this window's storage. */
const NO_FILTERS: Saved = { names: [], period: 'all', kind: null, world: null, unit: 'run', family: 'gold' }
const f = useStored<Saved>('loot.filters', NO_FILTERS, (raw) => ({ ...NO_FILTERS, ...(raw as Partial<Saved>) }))
const query = ref('')


// ---- the runs and what they gave -----------------------------------------------------------

const sessions = useSessions()
const all = computed(() => lootRuns(sessions.value))
const characters = computed(() => [...new Set(all.value.map((r) => r.name))])
/** The types and dungeons to pick from: those of the runs the characters and period keep. */
const choices = computed(() => lootChoices(filterRuns(all.value, { names: f.value.names, from: fromOf(f.value.period), kind: null, world: null })))
const kindOptions = computed(() => [{ id: '', label: 'All types' }, ...choices.value.kinds.map((k) => ({ id: k.id, label: `${t(k.label)} (${k.count})` }))])
const worldOptions = computed(() => [
  { id: 0, label: 'All dungeons' },
  ...choices.value.worlds.filter((w) => f.value.kind === null || w.kind === f.value.kind).map((w) => ({ id: w.id, label: `${w.label} (${w.count})` })),
])
const runs = computed(() => filterRuns(all.value, { names: f.value.names, from: fromOf(f.value.period), kind: f.value.kind, world: f.value.world }))
/**
 * A line a character, the total last: the characters picked (all, when none is) each keep theirs, with
 * no run where the filters leave them none (a dungeon only one of them did), so none seems to vanish.
 */
const rows = computed(() => {
  const list = summaries(runs.value)
  const shown = new Set(list.map((r) => r.name))
  const picked = f.value.names.length ? f.value.names : characters.value
  const none = picked.filter((n) => !shown.has(n)).map((n) => summarize(n, []))
  return [...list.slice(0, -1), ...none, list.at(-1)!]
})
const total = computed(() => rows.value.at(-1)!)
/** The luck of the characters picked over these runs: their gold drops and cards against the drop rates, of the items that tell it. */
const verdict = computed(() => luckVerdict(LOOT_KINDS.map((k) => [total.value.luck.got[k.key], total.value.luck.expected[k.key]] as const)))
const items = computed(() => {
  const q = query.value.trim().toLowerCase()
  return itemStats(runs.value.map((r) => r.run)).filter((i) => (f.value.family === 'all' || (f.value.family === 'gold' ? i.family !== 'other' : i.family === f.value.family)) && (!q || i.name.toLowerCase().includes(q)))
})


// ---- the numbers ----------------------------------------------------------------------------

/** `n` a unit of `s` (a run, a cube, an hour), or '–' with none. */
function rate(s: Pick<LootSummary, 'runs' | 'cubes' | 'ms'>, n: number): string {
  const units = unitsOf(s, f.value.unit)
  if (!units) return '–'
  const r = n / units
  return r >= 100 ? Math.round(r).toLocaleString('en-US') : r.toFixed(2)
}
/** Your luck as a figure: ×1.4 (40% more than the game's rates make of your cubes), with its colour. */
function luckOf(got: number, expected: number): { text: string; class: string } | null {
  const l = luck(got, expected)
  if (l === null) return null
  return { text: `×${l.toFixed(l >= 10 ? 0 : 2)}`, class: l >= 1.1 ? 'text-green' : l <= 0.9 ? 'text-red' : 'text-dark' }
}
const mmss = (ms: number | null): string => (ms === null ? '–' : duration(ms))
const hours = (ms: number): string => `${(ms / 3_600_000).toFixed(1)} h`
/** One every how many runs an item drops, from its chance a run. */
const oneIn = (chance: number): string => (chance > 0 ? (1 / chance < 1.05 ? t('every run') : t('1 in {n} runs', { n: (1 / chance).toFixed(1) })) : '–')
</script>

<template>
  <div>
    <PageHeader v-if="!embedded" title="Loot" about="What your dungeon runs gave, from their cubes: by character and by item, per run, per cube or per hour in them. Only the runs whose cubes the overlay saw count. Your luck: what you got against what the drop rates of the game (questlog.gg) make of your cubes, ×1 being just that." />

    <!-- The filters: the characters and the period (components/StatsFilters.vue), then this view's. -->
    <StatsFilters v-model:names="f.names" v-model:period="f.period" :characters="characters">
      <FilterRow label="Dungeons">
        <SelectBox :model-value="f.kind ?? ''" size="sm" :options="kindOptions" @update:model-value="(v) => (f = { ...f, kind: v || null, world: null })" />
        <SelectBox :model-value="f.world ?? 0" size="sm" :options="worldOptions" @update:model-value="(v) => (f.world = v || null)" />
      </FilterRow>
      <FilterRow label="Rates">
        <Segmented v-model="f.unit" size="sm" :options="UNITS" />
      </FilterRow>
    </StatsFilters>

    <EmptyState v-if="!total.runs" :title="all.length ? 'No runs match.' : 'No dungeon loot yet.'" hint="A run counts once the overlay has seen its cube opened." />

    <template v-else>
      <LuckVerdict :verdict="verdict" what="dungeon runs" about="Your gold equipment, gold materials, wings and artworks and Arcana cards against what the drop rates make of your cubes, of the items that drop one at a time" />
      <!-- By character, then all of them. -->
      <div class="mb-5 overflow-x-auto rounded-xl border border-card">
        <table class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-xs text-darker">
              <th class="px-4 py-2 text-left font-normal" />
              <th class="px-3 py-2 text-center font-normal">{{ t('Runs') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Cubes') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Time') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Mean clear') }}</th>
              <th class="px-3 py-2 text-center font-normal text-yellow">{{ t('Kina') }}</th>
              <th v-for="k in LOOT_KINDS" :key="k.key" class="px-3 py-2 text-center font-normal">
                <span :class="['inline-flex items-center gap-1', LOOT_KIND_STYLE[k.key]!.class]">
                  <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ t(k.label) }}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows.length > 2 ? rows : rows.slice(-1)" :key="r.name" :class="['border-t border-card', !r.name && 'bg-card/40 font-semibold', r.name && !r.runs && 'opacity-40']" :title="r.name && !r.runs ? t('No run with these filters') : undefined">
              <td class="px-4 py-2">
                <span class="flex items-center gap-2">
                  <CharName v-if="r.name" :name="r.name" :size="16" /><template v-else>{{ rows.length > 2 ? t('All characters') : rows[0]!.name }}</template>
                </span>
              </td>
              <td class="px-3 py-2 text-center">
                {{ r.runs }}
              </td>
              <td class="px-3 py-2 text-center">{{ r.cubes }}</td>
              <td class="px-3 py-2 text-center text-dark">{{ hours(r.ms) }}</td>
              <td class="px-3 py-2 text-center text-dark">{{ mmss(r.clearMs) }}</td>
              <td class="px-3 py-2 text-center">
                <span class="text-yellow">{{ unitsOf(r, f.unit) ? formatKina(r.kina / unitsOf(r, f.unit)) : '–' }}</span>
              </td>
              <td v-for="k in LOOT_KINDS" :key="k.key" class="px-3 py-2 text-center" :title="t('{n} in all; expected from the drop rates: {e}', { n: r[k.key], e: r.expected[k.key].toFixed(1) })">
                <span :class="!r[k.key] ? 'text-darker' : LOOT_KIND_STYLE[k.key]!.class">{{ rate(r, r[k.key]) }}</span>
                <span class="ml-1 text-[11px] font-normal text-darker">({{ r[k.key] }})</span>
                <span v-if="details && luckOf(r.luck.got[k.key], r.luck.expected[k.key])" :class="['ml-1 text-[11px] font-normal', luckOf(r.luck.got[k.key], r.luck.expected[k.key])!.class]">{{ luckOf(r.luck.got[k.key], r.luck.expected[k.key])!.text }}</span>
                <LuckVerdict compact :verdict="luckVerdict([[r.luck.got[k.key], r.luck.expected[k.key]]])" what="dungeon runs" about="" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- By item. -->
      <div class="rounded-xl border border-card">
        <div class="flex flex-wrap items-center gap-2 border-b border-card px-4 py-2.5">
          <span class="text-sm font-medium">{{ t('Items') }}</span>
          <Segmented v-model="f.family" size="sm" :options="FAMILIES" />
          <input
            v-model="query"
            type="search"
            :placeholder="t('Search an item')"
            class="ml-auto h-7 w-52 rounded-md border border-light bg-default px-2.5 text-xs placeholder:text-darkest focus:border-accent"
          />
        </div>
        <p v-if="!items.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('Nothing of that dropped in these runs.') }}</p>
        <table v-else class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-xs text-darker">
              <th class="px-4 py-2 text-left font-normal">{{ plural(items.length, '{n} item', '{n} items') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('In all') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Your rate') }} <span class="text-darkest">{{ t(UNITS.find((u) => u.id === f.unit)!.label).toLowerCase() }}</span></th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Game rate') }}</th>
              <template v-if="details">
                <th class="px-3 py-2 text-center font-normal">{{ t('Expected') }}</th>
                <th class="px-3 py-2 text-center font-normal">{{ t('Your luck') }}</th>
                <th class="px-3 py-2 text-center font-normal">{{ t('Runs with it') }}</th>
                <th class="px-3 py-2 text-center font-normal">{{ t('Chance a run') }}</th>
              </template>
            </tr>
          </thead>
          <tbody>
            <tr v-for="i in items" :key="i.id" class="border-t border-card">
              <td class="px-4 py-1.5">
                <span class="flex items-center gap-2">
                  <img v-if="itemIcon(i.icon)" :src="itemIcon(i.icon)!" alt="" class="size-5 shrink-0 rounded-sm" draggable="false" />
                  <svg v-else viewBox="0 0 16 16" :class="['size-5 shrink-0', gradeClass(i.grade)]" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path :d="ICON.box" /></svg>
                  <span :class="gradeClass(i.grade)">{{ i.name }}</span>
                </span>
              </td>
              <td class="px-3 py-1.5 text-center">{{ i.total.toLocaleString('en-US') }}</td>
              <td class="px-3 py-1.5 text-center">{{ rate(total, i.total) }}</td>
              <td class="px-3 py-1.5 text-center text-dark">{{ i.expected ? rate(total, i.expected) : '–' }}</td>
              <template v-if="details">
                <td class="px-3 py-1.5 text-center text-dark">{{ i.expected ? i.expected.toFixed(1) : '–' }}</td>
                <td class="px-3 py-1.5 text-center">
                  <span v-if="i.noLuck && i.expected" class="text-darker" :title="t('It comes several at once: the drop rates do not say how many, so what it makes expected is a guess, left out of your luck')">?</span>
                  <span v-else-if="luckOf(i.total, i.expected)" :class="luckOf(i.total, i.expected)!.class">{{ luckOf(i.total, i.expected)!.text }}</span>
                  <template v-else>–</template>
                </td>
                <td class="px-3 py-1.5 text-center text-dark">{{ i.runs }} / {{ total.runs }}</td>
                <td class="px-3 py-1.5 text-center">
                  {{ Math.round((i.runs / total.runs) * 100) }}%
                  <span class="ml-1 text-[11px] text-darker">{{ oneIn(i.runs / total.runs) }}</span>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
