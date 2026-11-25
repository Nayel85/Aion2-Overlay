<script setup lang="ts">
// Personal bests: each character's best on each dungeon boss (the engine keeps them apart from the
// fights), by dungeon, then boss; all characters, or one picked. A Nightmare's says its level (the
// session's run it was in). A row opens the fight of your best DPS on it; each figure opens its own
// fight (the party's best, the fastest kill). The fight opens in this page.
import { onHistory } from '@/lib/history.ts'
import { compact } from '@shared/format.ts'
import { computed, ref } from 'vue'
import DetailsPage from '@/pages/DetailsPage.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, t } from '@/lib/i18n.ts'
import { useStored } from '@/lib/now.ts'
import { useApp } from '@/stores/app.ts'
import type { Best, Encounter } from '@shared/meter.ts'
import { zoneMode } from '@shared/sessions.ts'
import { ZONES } from '@shared/zones.ts'

const store = useApp()
const api = bridge()
const bests = ref<Encounter[] | null>(null)
const shown = computed(() => (bests.value ?? []).filter((e) => e.myDps || e.fastest))

/** The characters with a best, and the one picked (null: all of them), remembered. */
const characters = computed(() => [...new Set(shown.value.map((e) => e.character))].sort((a, b) => a.localeCompare(b)))
const who = useStored<string | null>('bests.who', null, (raw) => (typeof raw === 'string' ? raw : null))
const picked = computed(() => (who.value && characters.value.includes(who.value) ? who.value : null))

/** By dungeon (the game's order), each one's bosses (then characters, when all are shown). */
const byDungeon = computed(() => {
  const by = new Map<number, Encounter[]>()
  for (const e of shown.value) if (!picked.value || e.character === picked.value) by.set(e.dungeonId, [...(by.get(e.dungeonId) ?? []), e])
  return [...by]
    .sort((a, b) => a[0] - b[0])
    .map(([id, list]) => ({ id, name: dungeonName(id), list: list.sort((a, b) => a.bossName.localeCompare(b.bossName) || a.character.localeCompare(b.character)) }))
})
/** A dungeon as the game names it, with its mode ("Vakron Sky Island · Normal"). */
function dungeonName(id: number): string {
  const name = ZONES[id]?.[0] ?? `#${id}`
  const mode = zoneMode(id, t)
  return mode ? `${name} · ${mode}` : name
}

/** A Nightmare's level at a moment, in a dungeon: the session's run it was in (kept with the session). */
const nightmares = computed(() =>
  [...store.sessions.history, ...(store.sessions.current ? [store.sessions.current] : [])].flatMap((s) =>
    (s.runs ?? []).filter((r) => r.level !== undefined).map((r) => ({ world: r.world, start: r.start, end: r.end ?? Infinity, level: r.level! })),
  ),
)
const levelAt = (dungeon: number, at: number): number | null => nightmares.value.find((r) => r.world === dungeon && at >= r.start && at <= r.end)?.level ?? null
/** A row's Nightmare level, from its fight's moment, if it is one. */
const level = (e: Encounter): number | null => {
  const f = rowFight(e)
  return f ? levelAt(e.dungeonId, f.atMs) : null
}

const mmss = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const day = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })

/** The fight open in place of the list. */
const opened = ref<string | null>(null)
const open = (b: Best | null): void => void (b && (opened.value = b.fightId))
/** A row's fight: your best DPS on it, else its fastest kill. */
const rowFight = (e: Encounter): Best | null => e.myDps ?? e.fastest ?? e.partyDps

async function load(): Promise<void> {
  bests.value = await api.invoke('history:bests')
}
onHistory(load)
</script>

<template>
  <DetailsPage v-if="opened" :key="opened" :source="{ kind: 'saved', id: opened }" @back="opened = null" />
  <div v-show="!opened">
    <PageHeader title="Personal bests" about="Your best damage per second on each dungeon boss, each character; a beaten one shows on the meter. Click one for its fight." />

    <p v-if="bests === null" class="text-sm text-darker">{{ t('Loading…') }}</p>
    <div v-else-if="!shown.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No personal best yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each dungeon boss you kill sets one.') }}</div>
    </div>
    <template v-else>
      <!-- Whose. -->
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          :class="['rounded-full border px-2.5 py-1 text-xs', picked === null ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
          @click="who = null"
        >
          {{ t('All characters') }}
        </button>
        <button
          v-for="c in characters"
          :key="c"
          type="button"
          :class="['rounded-full border px-2.5 py-1 text-xs', picked === c ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
          @click="who = c"
        >
          {{ c }}
        </button>
      </div>

      <div class="overflow-x-auto rounded-xl border border-card">
        <table class="w-full text-sm tabular-nums">
          <thead class="bg-card text-xs uppercase tracking-wide text-darker">
            <tr>
              <th class="py-2.5 pl-4 text-left font-medium">{{ t('Boss') }}</th>
              <th v-if="picked === null" class="px-3 text-left font-medium">{{ t('Character') }}</th>
              <th class="px-3 text-right font-medium">{{ t('Your DPS') }}</th>
              <th class="px-3 text-right font-medium">{{ t('Party DPS') }}</th>
              <th class="px-3 pr-4 text-right font-medium">{{ t('Fastest kill') }}</th>
            </tr>
          </thead>
          <tbody v-for="d in byDungeon" :key="d.id">
            <tr><td :colspan="picked === null ? 5 : 4" class="bg-card/50 px-4 py-1 text-xs font-semibold">{{ d.name }}</td></tr>
            <tr
              v-for="e in d.list"
              :key="`${e.character}:${e.mobCode}`"
              class="cursor-pointer border-t border-card hover:bg-card"
              :title="t('Open the fight')"
              @click="open(rowFight(e))"
            >
              <td class="py-1.5 pl-4">
                <span :class="e.finalBoss && 'font-medium'">{{ e.bossName }}</span>
                <span v-if="level(e) !== null" class="ml-2 rounded bg-dark px-1.5 text-[11px] font-semibold text-yellow">{{ t('Lv {n}', { n: level(e)! }) }}</span>
              </td>
              <td v-if="picked === null" class="px-3 py-1.5 text-dark">{{ e.character }}</td>
              <td class="px-3 py-1.5 text-right">
                <button v-if="e.myDps" type="button" class="font-semibold text-yellow hover:underline" @click.stop="open(e.myDps)">{{ compact(e.myDps.value) }}</button>
                <span v-else class="text-darker">–</span>
                <span v-if="e.myDps" class="ml-1.5 text-[11px] text-darker">{{ day(e.myDps.atMs) }}</span>
              </td>
              <td class="px-3 py-1.5 text-right">
                <button v-if="e.partyDps" type="button" class="text-dark hover:underline" @click.stop="open(e.partyDps)">{{ compact(e.partyDps.value) }}</button>
                <span v-else class="text-darker">–</span>
              </td>
              <td class="px-3 py-1.5 pr-4 text-right">
                <button v-if="e.fastest" type="button" class="text-dark hover:underline" @click.stop="open(e.fastest)">{{ mmss(e.fastest.value) }}</button>
                <span v-else class="text-darker">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
