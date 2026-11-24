<script setup lang="ts">
// Personal bests: each character's best on each dungeon boss (the engine keeps them apart from the
// fights), by character, then dungeon and boss. A row opens the fight of your best DPS on it; each
// figure opens its own fight (the party's best, the fastest kill). The fight opens in this page.
import { onHistory } from '@/lib/history.ts'
import { compact } from '@shared/format.ts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import DetailsPage from '@/pages/DetailsPage.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, t } from '@/lib/i18n.ts'
import type { Best, Encounter } from '@shared/meter.ts'
import { zoneMode } from '@shared/sessions.ts'
import { ZONES } from '@shared/zones.ts'

const api = bridge()
const bests = ref<Encounter[] | null>(null)
/** By character, each one's bosses by dungeon, then boss. */
const byCharacter = computed(() => {
  const by = new Map<string, Encounter[]>()
  for (const e of bests.value ?? []) if (e.myDps || e.fastest) by.set(e.character, [...(by.get(e.character) ?? []), e])
  return [...by]
    .map(([name, list]) => ({ name, list: list.sort((a, b) => a.dungeonId - b.dungeonId || a.bossName.localeCompare(b.bossName)) }))
    .sort((a, b) => a.name.localeCompare(b.name))
})
/** A dungeon as the game names it, with its mode ("Vakron Sky Island · Normal"). */
function dungeonName(id: number): string {
  const name = ZONES[id]?.[0] ?? `#${id}`
  const mode = zoneMode(id, t)
  return mode ? `${name} · ${mode}` : name
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
    <div v-else-if="!byCharacter.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No personal best yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each dungeon boss you kill sets one.') }}</div>
    </div>
    <div v-else class="overflow-x-auto rounded-xl border border-card">
      <table class="w-full text-sm tabular-nums">
        <thead class="bg-card text-xs uppercase tracking-wide text-darker">
          <tr>
            <th class="py-2.5 pl-4 text-left font-medium">{{ t('Boss') }}</th>
            <th class="px-3 text-left font-medium">{{ t('Dungeon') }}</th>
            <th class="px-3 text-right font-medium">{{ t('Your DPS') }}</th>
            <th class="px-3 text-right font-medium">{{ t('Party DPS') }}</th>
            <th class="px-3 pr-4 text-right font-medium">{{ t('Fastest kill') }}</th>
          </tr>
        </thead>
        <tbody v-for="c in byCharacter" :key="c.name">
          <tr><td colspan="5" class="bg-card/50 px-4 py-1 text-xs font-semibold">{{ c.name }}</td></tr>
          <tr
            v-for="e in c.list"
            :key="`${e.dungeonId}:${e.mobCode}`"
            class="cursor-pointer border-t border-card hover:bg-card"
            :title="t('Open the fight')"
            @click="open(rowFight(e))"
          >
            <td class="py-1.5 pl-4"><span :class="e.finalBoss && 'font-medium'">{{ e.bossName }}</span></td>
            <td class="px-3 py-1.5 text-dark">{{ dungeonName(e.dungeonId) }}</td>
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
  </div>
</template>
