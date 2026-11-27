<script setup lang="ts">
// Copied from Nyerk (GPL-3.0), https://github.com/xCROv/aion2-nyerk
// app/src/renderer/src/components/panel/PvpLogTab.vue at ddcdc48 (0.2.17).
// The PvP kill feed: the kills that concern you (yours, your deaths, those of players you fought,
// your legion's), newest first, as the game credits them (the killing blow), each kill or assist with
// the Abyss Points it earned. Your kills in green, your deaths in red; players from other servers
// carry their server's tag ([LUM]).
// Lokthar: the rift farms on top (shared/abyss.ts), each the Abyss Points one character earned in a
// Spacetime Rift's window, with your kills, deaths and assists in it; picking one lists those.
import { combatPower } from '@shared/format.ts'
import CharName from '@/components/CharName.vue'
import Chip from '@/components/ui/Chip.vue'
import { numericDate, timeOfDay } from '@/lib/format.ts'
import { useNow } from '@/lib/now.ts'
import { computed, onBeforeUnmount, ref, shallowRef, triggerRef } from 'vue'
import Button from '@/components/Button.vue'
import { bridge } from '@/lib/bridge.ts'
import { plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { concernsYou, PVP_LIMIT, type PvpKill } from '@shared/tracker.ts'
import { attributeGains, RIFT_MIN_POINTS as RIFT_MIN, RIFT_MS, type AbyssGain, type RiftFarm } from '@shared/abyss.ts'
import { formatAmount } from '@shared/earnings.ts'

const store = useApp()
const history = shallowRef<PvpKill[]>([])
const api = bridge()
// Those that concern you (the others kept before 2026-11-27 left out).
const offHistory = api.on('tracker:pvp', (list) => (history.value = list.filter(concernsYou)))
const offKill = api.on('tracker:pvpKill', (kill) => {
  if (!concernsYou(kill)) return
  if (history.value.length >= PVP_LIMIT) history.value.shift()
  history.value.push(kill)
  triggerRef(history)
})
void api.invoke('tracker:get', true).then((s) => (history.value = s.pvp.filter(concernsYou)))
// The Abyss Points gains, for what each kill earned: read again as one comes (the rifts are told then).
const gains = shallowRef<AbyssGain[]>([])
const loadGains = (): void => void api.invoke('abyss:gains').then((g) => (gains.value = g))
loadGains()
const offGains = api.on('tracker:rifts', loadGains)
onBeforeUnmount(() => { offHistory(); offKill(); offGains() })

/** Combat power as the game rounds it: 115485 → 115.4K. */
const cp = combatPower
// One filter at a time; clicking the active one shows everything again.
type Filter = 'mine' | 'legion'
const filters: { id: Filter; label: string; title: string; empty: string }[] = [
  { id: 'mine', label: 'Mine', title: 'Your kills and deaths', empty: 'No kills or deaths of yours yet.' },
  { id: 'legion', label: 'My Guild', title: "Kills and deaths of your legion's members, yours included", empty: 'No kills or deaths of your legion yet.' },
]
const filter = ref<Filter | null>(null)
function pick(id: Filter): void {
  filter.value = filter.value === id ? null : id
  rift.value = null
  limit.value = PAGE
}
/** You fought this player before someone else took the kill. */
const isAssist = (k: PvpKill): boolean => !!k.fight && !k.mine && !k.died

// The rift farms: the newest few, more on request; one picked lists its kills, deaths and assists.
const RIFTS = 5
const allRifts = ref(false)
const rifts = computed(() => (allRifts.value ? store.rifts : store.rifts.slice(0, RIFTS)))
const rift = ref<RiftFarm | null>(null)
const sameRift = (a: RiftFarm | null, b: RiftFarm): boolean => !!a && a.start === b.start && a.name === b.name
function pickRift(f: RiftFarm): void {
  rift.value = sameRift(rift.value, f) ? null : f
  filter.value = null
  limit.value = PAGE
}
/** Yours (a kill, a death or an assist) and in the rift's window. */
const inRift = (k: PvpKill, f: RiftFarm): boolean => k.at >= f.start && k.at < f.start + RIFT_MS && (k.mine || k.died || isAssist(k))
const riftCounts = (f: RiftFarm): { kills: number; deaths: number; assists: number } => {
  const out = { kills: 0, deaths: 0, assists: 0 }
  for (const k of history.value) {
    if (!inRift(k, f)) continue
    if (k.mine) out.kills++
    else if (k.died) out.deaths++
    else out.assists++
  }
  return out
}
const riftStats = computed(() => new Map(rifts.value.map((f) => [f, riftCounts(f)])))
/** "PvP Rift 17:00 14/11". */
const riftName = (f: RiftFarm): string => t('PvP Rift {time} {day}', { time: timeOfDay(f.start), day: numericDate(f.start) })
const riftOpen = (f: RiftFarm): boolean => now.value < f.start + RIFT_MS
const riftTitle = (f: RiftFarm): string =>
  t('Abyss Points earned from {from} to {to} (the rift opens, and is over 1 h 10 min later)', { from: timeOfDay(f.start), to: timeOfDay(f.start + RIFT_MS) })

const filtered = computed(() => {
  const farm = rift.value
  if (farm) return history.value.filter((k) => inRift(k, farm))
  if (filter.value === 'mine') return history.value.filter((k) => k.mine || k.died)
  if (filter.value === 'legion') return history.value.filter((k) => k.legion)
  return null
})
/** The picked rift's Abyss Points by kill or assist (your deaths earn none), and what no kill explains. */
const riftAp = computed(() => {
  const farm = rift.value
  if (!farm) return null
  const events = history.value.filter((k) => inRift(k, farm) && (k.mine || isAssist(k)))
  const { byEvent, other } = attributeGains(farm.gains ?? [], events)
  return { byEvent, other, fromKills: farm.points - other }
})
/** Every kill or assist of yours with the Abyss Points that came in right after it (out of a rift too). */
const allAp = computed(() => {
  const events = history.value.filter((k) => k.mine || isAssist(k))
  if (!events.length) return new Map<PvpKill, number>()
  const from = events[0]!.at - 60_000
  const near = gains.value.filter(([at]) => at >= from).map(([at, gained]): [number, number] => [at, gained])
  return attributeGains(near, events).byEvent
})
const apOf = (k: PvpKill): number => (riftAp.value ?? { byEvent: allAp.value }).byEvent.get(k) ?? 0
const total = computed(() => (filtered.value ?? history.value).length)
const PAGE = 200
const limit = ref(PAGE)
const shown = computed(() => {
  const list = filtered.value ?? history.value
  return list.slice(-limit.value).reverse()
})
const counts = computed(() => ({
  kills: store.pvpStats.kills,
  deaths: store.pvpStats.deaths,
}))

// "2 min ago": redrawn every 15 s.
const now = useNow(15_000)
function ago(ms: number): string {
  const s = Math.max(0, Math.round((now.value - ms) / 1000))
  if (s < 60) return t('just now')
  const m = Math.round(s / 60)
  return m < 60 ? t('{n} min ago', { n: m }) : timeOfDay(ms)
}
const rowClass = (k: PvpKill): string =>
  k.mine ? 'bg-green/10 border-l-2 border-green' : k.died ? 'bg-danger/10 border-l-2 border-danger' : 'border-l-2 border-transparent'
const clear = (): void => void bridge().invoke('tracker:clearPvp')
/** A kill you took part in: its fight, in place of the list (the page shows its Details). */
const emit = defineEmits<{ open: [fight: string] }>()
const openFight = (k: PvpKill): void => {
  if (k.fight) emit('open', k.fight)
}
const fightTitle = (k: PvpKill): string | undefined =>
  k.fight ? t('Show the fight: damage and skills, yours and theirs') : k.mine || k.died ? t('No hits between you were seen before this one') : undefined
/** The kill feed over the game (its own small window). */
const hudOpen = computed(() => store.settings.killFeed.open)
const toggleHud = (): void => void bridge().invoke(hudOpen.value ? 'killfeed:close' : 'killfeed:open')

// The overlays over the game, set up here: the kill feed's look, and Enemies nearby.
</script>

<template>
  <div class="space-y-3 p-3">
    <div class="flex items-center gap-2 text-xs">
      <span class="rounded-md bg-card px-2 py-1"><span class="font-semibold text-green">{{ counts.kills }}</span> kills</span>
      <span class="rounded-md bg-card px-2 py-1"><span class="font-semibold text-danger">{{ counts.deaths }}</span> {{ t('deaths') }}</span>
      <Button size="sm" class="ml-auto" :disabled="!history.length" @click="clear">{{ t('Clear') }}</Button>
      <Button size="sm" :intent="hudOpen ? 'default' : 'primary'" :title="hudOpen ? t('Close the kill feed over the game') : t('A small kill feed over the game')" @click="toggleHud">
        {{ hudOpen ? t('Close HUD') : t('Open HUD') }}
      </Button>
    </div>

    <section v-if="store.rifts.length" class="overflow-hidden rounded-lg border border-card bg-card">
      <h3 class="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-darker" :title="t('Each Spacetime Rift where you earned at least {n} Abyss Points', { n: formatAmount(RIFT_MIN) })">{{ t('Rift farms') }}</h3>
      <ul class="divide-y divide-[color:var(--line)]">
        <li
          v-for="f in rifts"
          :key="`${f.start}-${f.name}`"
          :class="['flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-dark', sameRift(rift, f) && 'bg-accent/10']"
          :title="riftTitle(f)"
          @click="pickRift(f)"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate font-medium">{{ riftName(f) }}</span>
              <span v-if="riftOpen(f)" class="shrink-0 rounded bg-green/15 px-1.5 text-[10px] font-semibold text-green">{{ t('now') }}</span>
            </div>
            <div v-if="f.name" class="truncate text-[11px] text-darker">{{ f.name }}</div>
          </div>
          <span class="shrink-0 rounded-md bg-dark px-1.5 py-0.5 text-[11px] tabular-nums" :title="t('Kills, deaths and assists')">
            <span class="text-green">{{ riftStats.get(f)?.kills ?? 0 }}</span>
            <span class="text-darker"> / </span>
            <span class="text-danger">{{ riftStats.get(f)?.deaths ?? 0 }}</span>
            <span class="text-darker"> / </span>
            <span class="text-accent">{{ riftStats.get(f)?.assists ?? 0 }}</span>
          </span>
          <span class="w-16 shrink-0 text-right font-semibold tabular-nums text-blue">+{{ formatAmount(f.points) }} AP</span>
        </li>
      </ul>
      <button
        v-if="store.rifts.length > RIFTS"
        type="button"
        class="w-full border-t border-[color:var(--line)] py-1.5 text-xs text-darker hover:text-dark"
        @click="allRifts = !allRifts"
      >
        {{ allRifts ? t('Show fewer') : t('Show older ({n} more)', { n: store.rifts.length - RIFTS }) }}
      </button>
    </section>

    <div class="flex items-center gap-1.5 text-xs">
      <button
        v-if="rift"
        type="button"
        class="rounded-full border border-accent bg-accent/15 px-2.5 py-0.5 text-default"
        :title="t('Show every kill again')"
        @click="rift = null"
      >
        {{ riftName(rift) }} ×
      </button>
      <Chip v-for="f in filters" :key="f.id" size="sm" :on="filter === f.id" :title="t(f.title)" @click="pick(f.id)">{{ t(f.label) }}</Chip>
      <!-- How many kills the list below holds (with the filter). -->
      <span class="ml-auto rounded-full bg-card px-2 py-0.5 tabular-nums text-dark" :title="plural(total, '{n} kill in the list', '{n} kills in the list')">{{ total }}</span>
    </div>

    <p v-if="riftAp" class="flex flex-wrap gap-x-3 px-1 text-[11px] text-darker">
      <span><span class="font-semibold tabular-nums text-blue">+{{ formatAmount(riftAp.fromKills) }}</span> {{ t('Abyss Points from your kills and assists') }}</span>
      <span v-if="riftAp.other > 0"><span class="font-semibold tabular-nums text-dark">+{{ formatAmount(riftAp.other) }}</span> {{ t('from other things (quests, monsters)') }}</span>
    </p>

    <ul v-if="total" class="divide-y divide-[color:var(--line)] overflow-hidden rounded-lg border border-card bg-card">
      <li
        v-for="(k, i) in shown"
        :key="`${k.at}-${i}`"
        :class="['flex items-center gap-2 px-3 py-2 text-sm', rowClass(k), k.fight && 'cursor-pointer hover:bg-dark']"
        :title="fightTitle(k)"
        @click="openFight(k)"
      >
        <div class="min-w-0 flex-1">
          <div class="flex min-w-0 items-center gap-1.5">
            <CharName :name="k.killer.name" :class-name="k.killer.className" :size="16" :name-class="['font-medium', k.mine && 'text-green']" :server="k.killer.server" hide-own-server />
            <span v-if="k.killer.combatPower" class="shrink-0 text-[11px] font-semibold tabular-nums text-yellow" :title="t('Combat power')">{{ cp(k.killer.combatPower) }}</span>
            <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 text-darker" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 8h9M9 4.5 12.5 8 9 11.5" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <CharName :name="k.victim?.name ?? t('a player out of view')" :class-name="k.victim?.className ?? null" :size="16" :name-class="['font-medium', k.died && 'text-danger']" :server="k.victim?.server ?? null" hide-own-server />
            <span v-if="k.victim?.combatPower" class="shrink-0 text-[11px] font-semibold tabular-nums text-yellow" :title="t('Combat power')">{{ cp(k.victim.combatPower) }}</span>
          </div>
          <div v-if="k.killer.guild" class="truncate text-[11px] text-darker">{{ k.killer.guild }}</div>
        </div>
        <span v-if="k.mine || isAssist(k)" :class="['shrink-0 text-[11px] font-semibold tabular-nums', apOf(k) ? 'text-blue' : 'text-darkest']" :title="t('Abyss Points this earned (the points that came in right after it)')">{{ apOf(k) ? `+${formatAmount(apOf(k))} AP` : '- AP' }}</span>
        <span v-if="k.fight && !k.mine && !k.died" class="shrink-0 rounded bg-accent/15 px-1.5 text-[10px] font-semibold text-accent" :title="t('You fought this player before someone else took the kill')">Assist</span>
        <span v-if="k.fight" class="shrink-0 text-[11px] font-medium text-accent">{{ t('Details') }} ›</span>
        <span class="shrink-0 text-[11px] tabular-nums text-darker" :title="timeOfDay(k.at)">{{ ago(k.at) }}</span>
      </li>
    </ul>
    <button
      v-if="total > shown.length"
      type="button"
      class="w-full rounded-lg border border-card bg-card py-1.5 text-xs text-darker hover:text-dark"
      @click="limit += PAGE"
    >
      {{ t('Show older ({n} more)', { n: total - shown.length }) }}
    </button>
    <p v-if="!total" class="rounded-lg border border-card bg-card px-3 py-6 text-center text-sm text-darker">
      {{ rift ? t('No kills, deaths or assists of yours in this rift.') : t(filters.find((f) => f.id === filter)?.empty ?? 'No player kills seen yet.') }}
    </p>


    <p class="text-[11px] text-darkest">
      {{ t('The player kills that concern you (yours, your deaths, those of players you fought, your legion\'s), as the game credits them: the killing blow only, so an assist is not a kill here. Kept until you clear them, across restarts.') }}
    </p>
  </div>
</template>
