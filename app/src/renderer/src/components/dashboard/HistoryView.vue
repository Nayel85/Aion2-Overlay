<script setup lang="ts">
// History: the boss fights the engine saved (every 30 s while one goes on, and before the meter is
// cleared), newest first. A click opens one in the Details window: each player's damage, skills and
// buffs. The last 500 are kept.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DetailsPage from '@/pages/DetailsPage.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { difficultyOf, DIFFICULTY_LABEL, dungeonFor, DUNGEON_KINDS, type Dungeon } from '@shared/dungeons.ts'
import { CLASS_NAMES, type FightSummary } from '@shared/meter.ts'

const api = bridge()
const fights = ref<FightSummary[] | null>(null)
const kind = ref<'bosses' | 'dummy' | 'all'>('bosses')
const query = ref('')
/** Fights grouped under their dungeon (the newest dungeon first), or one flat list. */
const grouped = ref(((): boolean => { try { return localStorage.getItem('history.grouped') !== '0' } catch { return true } })())
watch(grouped, (v) => { try { localStorage.setItem('history.grouped', v ? '1' : '0') } catch { /* private window */ } })
const folded = ref(new Set<string>())
const toggle = (key: string): void => void (folded.value.has(key) ? folded.value.delete(key) : folded.value.add(key), (folded.value = new Set(folded.value)))

const icons = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
const icon = (job: string): string | null => {
  const name = CLASS_NAMES[job]
  return name ? (Object.entries(icons).find(([k]) => k.endsWith(`/classes/${name.toLowerCase()}.png`))?.[1] ?? null) : null
}
function short(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`
  return Math.round(n).toLocaleString('en-US')
}
const clock = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const when = (ms: number): string => new Date(ms).toLocaleString(loc(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const shown = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (fights.value ?? []).filter(
    (f) => (kind.value === 'all' || (kind.value === 'dummy') === f.isTrain) && (!q || (f.bossName || '').toLowerCase().includes(q)),
  )
})
interface Group { key: string; name: string; kind: string | null; fights: FightSummary[]; last: number }
/** The timeline cut into runs: consecutive fights in the same dungeon share a group, and the same dungeon again later is a new one. */
const groups = computed<Group[]>(() => {
  const newest = [...shown.value].sort((a, b) => b.startTimeMs - a.startTimeMs)
  const where = dungeonFor(newest)
  const out: Group[] = []
  for (const f of newest) {
    const d: Dungeon | null = where.get(f.id) ?? null
    let tier: string | null = null
    try {
      const k = difficultyOf(f.dungeonId)
      tier = k ? t(DIFFICULTY_LABEL[k]) : null
    } catch { /* the label is a bonus: without it the group is just the dungeon */ }
    const name = d ? (tier ? `${d.name} · ${tier}` : d.name) : ''
    let g = out.at(-1)
    if (!g || g.name !== name) {
      g = { key: f.id, name, kind: d ? (DUNGEON_KINDS.find((k) => k.id === d.kind)?.label ?? null) : null, fights: [], last: 0 }
      out.push(g)
    }
    g.fights.push(f)
    g.last = Math.max(g.last, f.startTimeMs)
  }
  return out
})
/** What the table lists: the dungeons' groups, or everything as one. */
const sections = computed<Group[]>(() => (grouped.value ? groups.value : [{ key: '*', name: String(), kind: null, fights: shown.value, last: 0 }]))
const KINDS = computed(() => [
  { id: 'bosses' as const, label: 'Bosses', count: (fights.value ?? []).filter((f) => !f.isTrain).length },
  { id: 'dummy' as const, label: 'Training dummy', count: (fights.value ?? []).filter((f) => f.isTrain).length },
  { id: 'all' as const, label: 'All', count: (fights.value ?? []).length },
])

async function load(): Promise<void> {
  fights.value = await api.invoke('history:list')
}
/** The fight open in place of the list (its Details, in this page, with the full width of the panel). */
const opened = ref<string | null>(null)
const open = (id: string): void => void (opened.value = id)
function remove(id: string): void {
  void api.invoke('history:delete', id)
  fights.value = (fights.value ?? []).filter((f) => f.id !== id)
}

let off: (() => void) | null = null
onMounted(() => {
  void load()
  off = api.on('history:changed', () => void load())
})
onBeforeUnmount(() => off?.())
</script>

<template>
  <DetailsPage v-if="opened" :key="opened" :source="{ kind: 'saved', id: opened }" @back="opened = null" />
  <div v-show="!opened">
    <PageHeader title="Combat history" about="Boss fights saved as you play, newest first. Open one for each player's damage, skills and buffs." />

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Segmented v-model="kind" :options="KINDS" size="sm" />
      <label class="flex cursor-pointer items-center gap-2 text-sm text-dark">
        <input v-model="grouped" type="checkbox" class="size-3.5 accent-[color:var(--accent)]" />
        {{ t('Group by dungeon') }}
      </label>
      <input
        v-model="query"
        type="search"
        :placeholder="t('Search by boss')"
        class="ml-auto h-8 w-60 rounded-md border border-light bg-default px-2.5 text-sm placeholder:text-darkest focus:border-accent"
      />
    </div>

    <p v-if="fights === null" class="text-sm text-darker">{{ t('Loading…') }}</p>
    <div v-else-if="!shown.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ query ? t('No fights match.') : t('No fights saved yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each boss fight is kept as it ends, and before the meter is cleared.') }}</div>
    </div>
    <div v-else class="overflow-hidden rounded-xl border border-card">
      <table class="w-full text-sm">
        <thead class="bg-card text-xs uppercase tracking-wide text-darker">
          <tr class="border-b border-card">
            <th class="py-2.5 pl-4 text-left font-medium">{{ t('Fight') }}</th>
            <th class="px-3 text-left font-medium">Party</th>
            <th class="w-20 px-3 text-right font-medium">{{ t('Time') }}</th>
            <th class="w-24 px-3 text-right font-medium">{{ t('Damage') }}</th>
            <th class="w-24 px-3 text-right font-medium">DPS</th>
            <th class="w-36 px-3 text-left font-medium">{{ t('When') }}</th>
            <th class="w-12 pr-3" />
          </tr>
        </thead>
        <tbody class="divide-y divide-[color:var(--line)]">
          <template v-for="g in sections" :key="g.key">
          <tr v-if="grouped" class="cursor-pointer bg-card/60 hover:bg-card" @click="toggle(g.key)">
            <td colspan="7" class="px-4 py-1.5">
              <div class="flex items-center gap-2 text-xs">
                <svg viewBox="0 0 16 16" :class="['size-3 shrink-0 text-darker transition-transform', folded.has(g.key) ? '-rotate-90' : '']" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4" /></svg>
                <span class="text-sm font-semibold">{{ g.name || t('Other fights') }}</span>
                <span v-if="g.kind" class="rounded border border-light px-1 text-[10px] text-darker">{{ t(g.kind) }}</span>
                <span class="text-darker">{{ plural(g.fights.length, '1 fight', '{n} fights') }}</span>
                <span v-if="g.last" class="ml-auto text-darker">{{ when(g.last) }}</span>
              </div>
            </td>
          </tr>
          <template v-if="!grouped || !folded.has(g.key)">
          <tr v-for="f in g.fights" :key="f.id" class="group cursor-pointer hover:bg-card" @click="open(f.id)">
            <td class="py-2 pl-4">
              <div class="flex items-center gap-2">
                <span class="truncate font-medium">{{ f.bossName || t('Unknown target') }}</span>
                <span v-if="f.isTrain" class="shrink-0 rounded border border-light px-1 text-[10px] text-darker">dummy</span>
              </div>
            </td>
            <td class="px-3">
              <div class="flex items-center gap-0.5">
                <template v-for="(job, i) in f.memberJobs" :key="i">
                  <img v-if="icon(job)" :src="icon(job)!" class="size-4" alt="" :title="CLASS_NAMES[job]" />
                </template>
              </div>
            </td>
            <td class="px-3 text-right tabular-nums text-darker">{{ clock(f.durationMs) }}</td>
            <td class="px-3 text-right tabular-nums">{{ short(f.totalDamage) }}</td>
            <td class="px-3 text-right tabular-nums text-darker">{{ short(f.totalDamage / Math.max(1, f.durationMs / 1000)) }}</td>
            <td class="px-3 text-xs text-darker">{{ when(f.startTimeMs) }}</td>
            <td class="pr-3 text-right">
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md text-darker opacity-0 hover:bg-light hover:text-danger group-hover:opacity-100"
                :title="t('Delete this fight')"
                @click.stop="remove(f.id)"
              >
                <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5" /></svg>
              </button>
            </td>
          </tr>
          </template>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
