<script setup lang="ts">
// The crafts over the sessions kept (shared/craftStats.ts): picked by character, since when and
// craft, then by character (how many, how many procced, your proc rate against the game's chances:
// your luck) and by recipe (the same, with what the proc gives: a better item or the same twice).
// The filters picked are remembered (this window's storage).
import { classOf, fromOf, namePicker, type Period, PERIODS, useSessions } from '@/lib/statsFilters.ts'
import { useStored } from '@/lib/now.ts'
import { computed, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { t } from '@/lib/i18n.ts'
import { gradeClass } from '@/components/panel/sessionIcons.ts'
import { allCrafts, craftKinds, craftSummaries, filterCrafts, recipeStats, type CraftSummary } from '@shared/craftStats.ts'
import { luck } from '@shared/lootStats.ts'
import { itemIcon } from '@shared/sessions.ts'

/** Inside the Stats page (StatsView): its header is the page's. */
/** `details`: what the game's chances make expected, your luck, the crafts that can proc. */
defineProps<{ embedded?: boolean; details?: boolean }>()

// ---- the filters, remembered ------------------------------------------------------------------

type Show = 'all' | 'proc' | 'procced'
const SHOWS: { id: Show; label: string }[] = [
  { id: 'all', label: 'All recipes' },
  { id: 'proc', label: 'That can proc' },
  { id: 'procced', label: 'That procced' },
]
interface Saved {
  names: string[]
  period: Period
  kind: string | null
  show: Show
}
/** The filters picked, remembered in this window's storage. */
const NO_FILTERS: Saved = { names: [], period: 'all', kind: null, show: 'all' }
const f = useStored<Saved>('crafts.filters', NO_FILTERS, (raw) => ({ ...NO_FILTERS, ...(raw as Partial<Saved>) }))
const query = ref('')


/** The game's crafts, by the names questlog's data gives them. */
const CRAFT_LABELS: Record<string, string> = {
  alchemy: 'Alchemy',
  blacksmithing: 'Blacksmithing',
  cooking: 'Cooking',
  jewelcrafting: 'Jewelcrafting',
  tailoring: 'Tailoring',
}
const kindLabel = (id: string): string => t(CRAFT_LABELS[id] ?? 'Other')

// ---- the crafts -------------------------------------------------------------------------------

const sessions = useSessions()
const all = computed(() => allCrafts(sessions.value))
const characters = computed(() => [...new Set(all.value.map((c) => c.name))])
const kinds = computed(() => craftKinds(filterCrafts(all.value, { names: f.value.names, from: fromOf(f.value.period), kind: null })))
const kindOptions = computed(() => [{ id: '', label: t('All crafts') }, ...kinds.value.map((k) => ({ id: k.id, label: `${kindLabel(k.id)} (${k.count})` }))])
const crafts = computed(() => filterCrafts(all.value, { names: f.value.names, from: fromOf(f.value.period), kind: f.value.kind }))
const rows = computed(() => craftSummaries(crafts.value))
const total = computed(() => rows.value.at(-1)!)
const recipes = computed(() => {
  const q = query.value.trim().toLowerCase()
  return recipeStats(crafts.value).filter(
    (r) => (f.value.show === 'all' || (f.value.show === 'proc' ? r.chance > 0 : r.procs > 0)) && (!q || r.name.toLowerCase().includes(q) || (r.proc?.name.toLowerCase().includes(q) ?? false)),
  )
})

const { toggleName, picked } = namePicker(f, characters)
const className = (name: string): string | null => classOf(sessions.value, name)

// ---- the numbers ------------------------------------------------------------------------------

const pct = (n: number): string => `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`
/** Your proc rate: procs of the crafts that can proc. */
const rate = (s: Pick<CraftSummary, 'procs' | 'canProc'>): string => (s.canProc ? pct(s.procs / s.canProc) : '–')
/** Your luck as a figure: ×1.4 (40% more procs than the game's chances make of your crafts), with its colour. */
function luckOf(got: number, expected: number): { text: string; class: string } | null {
  const l = luck(got, expected)
  if (l === null) return null
  return { text: `×${l.toFixed(l >= 10 ? 0 : 2)}`, class: l >= 1.1 ? 'text-green' : l <= 0.9 ? 'text-red' : 'text-dark' }
}
</script>

<template>
  <div>
    <PageHeader v-if="!embedded" title="Crafts" about="Your crafts over the sessions kept: by character and by recipe, how many procced (a better item, or the same one twice), against the game's proc chances (questlog.gg). Your luck: the procs you got against what those chances make of your crafts, ×1 being just that." />

    <!-- The filters. -->
    <div class="mb-5 space-y-3 rounded-xl border border-card p-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-xs text-darker">{{ t('Characters') }}</span>
        <button
          v-for="name in characters"
          :key="name"
          type="button"
          :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', picked(name) ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
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
        <span class="w-24 text-xs text-darker">{{ t('Craft') }}</span>
        <SelectBox :model-value="f.kind ?? ''" size="sm" :options="kindOptions" @update:model-value="(v) => (f.kind = v || null)" />
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="w-24 text-xs text-darker">{{ t('Recipes') }}</span>
        <Segmented v-model="f.show" size="sm" :options="SHOWS" />
        <input v-model="query" type="search" :placeholder="t('Search a recipe or an item')" class="h-7 w-56 rounded-md border border-light bg-transparent px-2 text-xs outline-none focus:border-accent" />
      </div>
    </div>

    <div v-if="!total.crafts" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ all.length ? t('No crafts match.') : t('No crafts yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each craft counts once the overlay has seen it done.') }}</div>
    </div>

    <template v-else>
      <!-- By character, then all of them. -->
      <div class="mb-5 overflow-x-auto rounded-xl border border-card">
        <table class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-xs text-darker">
              <th class="px-4 py-2 text-left font-normal" />
              <th class="px-3 py-2 text-center font-normal">{{ t('Crafts') }}</th>
              <th class="px-3 py-2 text-center font-normal text-red">{{ t('Fails') }}</th>
              <th v-if="details" class="px-3 py-2 text-center font-normal">{{ t('That can proc') }}</th>
              <th class="px-3 py-2 text-center font-normal text-green">{{ t('Procs') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Your rate') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Recipes\' rate') }}</th>
              <th v-if="details" class="px-3 py-2 text-center font-normal">{{ t('Expected') }}</th>
              <th v-if="details" class="px-3 py-2 text-center font-normal">{{ t('Your luck') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows.length > 2 ? rows : rows.slice(-1)" :key="r.name" :class="['border-t border-card', !r.name && 'bg-card/40 font-semibold']">
              <td class="px-4 py-2">
                <span v-if="r.name" class="flex items-center gap-1.5"><ClassIcon :class-name="className(r.name)" :size="16" />{{ r.name }}</span>
                <span v-else>{{ t('All') }}</span>
              </td>
              <td class="px-3 py-2 text-center">{{ r.crafts }}</td>
              <td class="px-3 py-2 text-center text-red">{{ r.fails || '–' }}</td>
              <td v-if="details" class="px-3 py-2 text-center text-dark">{{ r.canProc }}</td>
              <td class="px-3 py-2 text-center text-green">{{ r.procs }}</td>
              <td class="px-3 py-2 text-center">{{ rate(r) }}</td>
              <td class="px-3 py-2 text-center text-dark">{{ r.canProc ? pct(r.expected / r.canProc) : '–' }}</td>
              <td v-if="details" class="px-3 py-2 text-center text-dark">{{ r.expected.toFixed(1) }}</td>
              <td v-if="details" class="px-3 py-2 text-center">
                <span v-if="luckOf(r.procs, r.expected)" :class="luckOf(r.procs, r.expected)!.class">{{ luckOf(r.procs, r.expected)!.text }}</span>
                <span v-else class="text-darker">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- By recipe. -->
      <div class="overflow-x-auto rounded-xl border border-card">
        <div v-if="!recipes.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('No recipe matches.') }}</div>
        <table v-else class="w-full text-sm tabular-nums">
          <thead>
            <tr class="text-xs text-darker">
              <th class="px-4 py-2 text-left font-normal">{{ t('Recipe') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Crafts') }}</th>
              <th class="px-3 py-2 text-center font-normal text-red">{{ t('Fails') }}</th>
              <th class="px-3 py-2 text-left font-normal">{{ t('Proc gives') }}</th>
              <th class="px-3 py-2 text-center font-normal text-green">{{ t('Procs') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Your rate') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Recipe\'s rate') }}</th>
              <th v-if="details" class="px-3 py-2 text-center font-normal">{{ t('Your luck') }}</th>
              <th class="px-3 py-2 text-center font-normal">{{ t('Made') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in recipes" :key="r.recipe" class="border-t border-card">
              <td class="px-4 py-1.5">
                <span class="flex items-center gap-1.5">
                  <img v-if="itemIcon(r.icon)" :src="itemIcon(r.icon)!" alt="" class="size-5 rounded-sm" draggable="false" />
                  <span :class="gradeClass(r.grade)">{{ r.name }}</span>
                  <span class="text-[11px] text-darker">{{ kindLabel(r.kind) }}</span>
                </span>
              </td>
              <td class="px-3 py-1.5 text-center">{{ r.crafts }}</td>
              <td class="px-3 py-1.5 text-center text-red">{{ r.fails || '–' }}</td>
              <td class="px-3 py-1.5">
                <span v-if="r.proc" class="flex items-center gap-1.5 text-xs">
                  <img v-if="itemIcon(r.proc.icon)" :src="itemIcon(r.proc.icon)!" alt="" class="size-4 rounded-sm" draggable="false" />
                  <span :class="gradeClass(r.proc.grade)">{{ r.proc.doubled ? t('x{n}', { n: r.proc.count }) : r.proc.name }}</span>
                </span>
                <span v-else class="text-xs text-darker">{{ t('No proc') }}</span>
              </td>
              <td class="px-3 py-1.5 text-center text-green">{{ r.chance ? r.procs : '–' }}</td>
              <td class="px-3 py-1.5 text-center">{{ r.chance ? pct(r.procs / r.crafts) : '–' }}</td>
              <td class="px-3 py-1.5 text-center text-dark">{{ r.chance ? pct(r.chance) : '–' }}</td>
              <td v-if="details" class="px-3 py-1.5 text-center">
                <span v-if="r.chance && luckOf(r.procs, r.crafts * r.chance)" :class="luckOf(r.procs, r.crafts * r.chance)!.class">{{ luckOf(r.procs, r.crafts * r.chance)!.text }}</span>
                <span v-else class="text-darker">–</span>
              </td>
              <td class="px-3 py-1.5 text-center text-xs">
                {{ r.madePlain }}<template v-if="r.madeProc"> + <span class="text-green">{{ r.madeProc }}</span></template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
