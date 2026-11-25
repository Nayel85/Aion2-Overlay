<script setup lang="ts">
// The sessions kept, the one going on first: on the left a list by day (each day's totals on its
// title), each session one line with what it did in a few words; on the right the one picked, all of
// it (SessionDetail). Filtered by character and since when, as the Loot page; the filters are
// remembered (this window's storage).
import { longDate } from '@/lib/format.ts'
import { timeOfDay } from '@/lib/format.ts'
import { fromOf, namePicker, type Period, PERIODS } from '@/lib/statsFilters.ts'
import { useStored } from '@/lib/now.ts'
import { computed, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import SessionDetail from '@/components/sessions/SessionDetail.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { ICON, LOOT_KIND_STYLE } from '@/components/panel/sessionIcons.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { characterId } from '@shared/characters.ts'
import { formatAmount } from '@shared/earnings.ts'
import { formatKina } from '@shared/kina.ts'
import { countedRuns, LOOT_KINDS, lootCounts, sessionDigest, type PlaySession } from '@shared/sessions.ts'

const store = useApp()

interface Saved {
  names: string[]
  period: Period
}
/** The filters picked, remembered in this window's storage. */
const NO_FILTERS: Saved = { names: [], period: 'all' }
const f = useStored<Saved>('sessions.filters', NO_FILTERS, (raw) => ({ ...NO_FILTERS, ...(raw as Partial<Saved>) }))

// ---- the sessions ---------------------------------------------------------------------------

const keyOf = (s: PlaySession): string => `${s.name}:${s.start}`
const live = computed(() => store.sessions.current)
const all = computed(() => (live.value ? [live.value, ...store.sessions.history] : store.sessions.history))
const characters = computed(() => [...new Set(all.value.map((s) => s.name))])
/** The sessions the filters keep, the latest first. */
const shown = computed(() => all.value.filter((s) => (!f.value.names.length || f.value.names.includes(s.name)) && s.last >= fromOf(f.value.period)).sort((a, b) => b.start - a.start))

interface Day {
  key: string
  label: string
  sessions: PlaySession[]
  ap: number
  kina: number
  runs: number
}
const days = computed<Day[]>(() => {
  const by = new Map<string, PlaySession[]>()
  for (const s of shown.value) {
    const d = new Date(s.start)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    by.set(key, [...(by.get(key) ?? []), s])
  }
  return [...by].map(([key, list]) => ({
    key,
    label: longDate(list[0]!.start),
    sessions: list,
    ap: list.reduce((n, s) => n + s.ap, 0),
    kina: list.reduce((n, s) => n + s.kina, 0),
    runs: list.reduce((n, s) => n + countedRuns(s).length, 0),
  }))
})

const picked = ref<string | null>(null)
/** The session shown: the one picked while the filters keep it, else the first listed. */
const selected = computed(() => shown.value.find((s) => keyOf(s) === picked.value) ?? shown.value[0] ?? null)

const names = computed({ get: () => f.value.names, set: (v: string[]) => (f.value = { ...f.value, names: v }) })
const { toggleName, picked: isPicked } = namePicker(names, characters)
function className(s: Pick<PlaySession, 'name' | 'server'>): string | null {
  return s.server !== null ? (store.characters[characterId(s.server, s.name)]?.className ?? null) : null
}
const serverOf = (name: string): number | null => all.value.find((s) => s.name === name)?.server ?? null
</script>

<template>
  <div>
    <PageHeader title="Past sessions" about="Every play session kept, the one going on first: what each character earned and did, its dungeons with what they gave, its field bosses and its gathering. Pick one on the left to see all of it." />

    <div class="mb-4 flex flex-wrap items-center gap-2">
      <button
        v-for="name in characters"
        :key="name"
        type="button"
        :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', isPicked(name) ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
        @click="toggleName(name)"
      >
        <ClassIcon :class-name="className({ name, server: serverOf(name) })" :size="14" />{{ name }}
      </button>
      <button v-if="f.names.length" type="button" class="text-xs text-darker hover:text-default hover:underline" @click="f.names = []">{{ t('All') }}</button>
      <Segmented v-model="f.period" class="ml-auto" size="sm" :options="PERIODS" />
    </div>

    <div v-if="!shown.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center text-sm text-darker">
      {{ all.length ? t('No sessions match.') : t('No sessions yet.') }}
    </div>

    <div v-else class="grid items-start gap-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
      <!-- The list, by day. -->
      <div class="max-h-[calc(100vh-220px)] overflow-y-auto rounded-xl border border-card text-xs">
        <section v-for="d in days" :key="d.key">
          <div class="sticky top-0 z-10 flex items-center gap-2 border-b border-card bg-default px-3 py-1.5">
            <span class="font-semibold uppercase tracking-wide text-darker first-letter:uppercase">{{ d.label }}</span>
            <span class="ml-auto flex items-center gap-3 tabular-nums text-darker">
              <span v-if="d.ap" class="text-blue">{{ formatAmount(d.ap) }}</span>
              <span v-if="d.kina" class="text-yellow">{{ formatKina(d.kina) }}</span>
              <span v-if="d.runs" class="flex items-center gap-1"><svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.dungeon" /></svg>{{ d.runs }}</span>
            </span>
          </div>
          <button
            v-for="s in d.sessions"
            :key="keyOf(s)"
            type="button"
            :class="['block w-full border-b border-card px-3 py-2 text-left last:border-b-0', selected && keyOf(selected) === keyOf(s) ? 'bg-accent/10' : 'hover:bg-card']"
            @click="picked = keyOf(s)"
          >
            <div class="flex items-center gap-1.5">
              <ClassIcon :class-name="className(s)" :size="16" />
              <span class="font-semibold">{{ s.name }}</span>
              <span class="text-darker">{{ timeOfDay(s.start) }}–{{ timeOfDay(s.last) }}</span>
              <span v-if="s === live" class="rounded-full bg-green/15 px-1.5 text-[10px] font-medium text-green">{{ t('In progress') }}</span>
              <span class="ml-auto flex items-center gap-2.5 tabular-nums">
                <span v-if="s.kina" class="text-yellow">{{ formatKina(s.kina) }}</span>
                <template v-for="k in LOOT_KINDS" :key="k.key">
                  <span v-if="lootCounts(countedRuns(s))[k.key]" :class="['flex items-center gap-0.5', LOOT_KIND_STYLE[k.key]!.class]" :title="t(k.label)"><svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ lootCounts(countedRuns(s))[k.key] }}</span>
                </template>
              </span>
            </div>
            <!-- What it did, in a few words. -->
            <div v-if="sessionDigest(s, t).length || s.gathering?.done" class="mt-0.5 truncate pl-[22px] text-darker">
              {{ [...sessionDigest(s, t), ...(s.gathering?.done ? [plural(s.gathering.done, '{n} gathering', '{n} gatherings')] : [])].join(' · ') }}
            </div>
          </button>
        </section>
      </div>

      <!-- The one picked, all of it. -->
      <div class="rounded-xl border border-card p-4 lg:sticky lg:top-4">
        <SessionDetail v-if="selected" :key="keyOf(selected)" :session="selected" :live="selected === live" />
      </div>
    </div>
  </div>
</template>
