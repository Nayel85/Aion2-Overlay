<script setup lang="ts">
// Characters: every character of your account the character selection screen listed, by server,
// with what the overlay knows of each (class, level, gear score, combat power, portrait), and their
// Odyle energy, entry counts, Kina and Abyss corridors at a glance, and what a server's characters share
// (Daily Dungeon, Shugo and invasion keys). Counters are read at each login and worked out from the
// game's refill times since: a character not logged in with the overlay yet shows greyed out.
import { ABYSS_POINTS, currencyIcon, itemInfo, KINA_ITEM, runsSince, SEASON_POINTS } from '@shared/sessions.ts'
import { useNow } from '@/lib/now.ts'
import { ago as timeAgo, weekdayTime, amount } from '@/lib/format.ts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CharacterExpeditions from '@/components/dashboard/CharacterExpeditions.vue'
import type { Expeditions } from '@shared/expeditions.ts'
import ClassIcon from '@/components/ClassIcon.vue'
import Countdown from '@/components/ui/Countdown.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { bridge } from '@/lib/bridge.ts'
import { plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { ASCENSION, characterId, lastRefill, SEASON_WEEK_MAX, WALLET_MORE, seasonWeekNow, SHUGO_MISSION, WEEKLY_RESET, CORRIDORS, corridorOffer, corridorStates, counterNow, DAILY_DUNGEON, ENERGY, INVASION_KEYS, membershipsNow, nextCorridorReset, NIGHTMARE, sharedNow, SHUGO_KEYS, type CorridorState, type CounterNow, type Refill, type TrackedCharacter } from '@shared/characters.ts'
import { formatKina } from '@shared/kina.ts'
import { serverLabel } from '@shared/servers.ts'

/** Each character's expeditions (main/expeditions.ts), kept up to date while the page is open. */
const expeditions = ref<Expeditions>({})
let offExpeditions: (() => void) | null = null
onMounted(async () => {
  offExpeditions = bridge().on('expeditions:changed', (e) => (expeditions.value = e))
  expeditions.value = await bridge().invoke('expeditions:get')
})
onBeforeUnmount(() => offExpeditions?.())

const store = useApp()
const now = useNow(1000)

/** The game's item icons (questlog.gg's copies, in public/items): energy, and the boss entry ticket. */
const ICONS = {
  energy: 'items/odyle-energy.webp',
  ticket: 'items/boss-ticket.webp',
  kina: currencyIcon(KINA_ITEM) ?? undefined,
  abyss: currencyIcon(ABYSS_POINTS) ?? undefined,
  oath: currencyIcon(SEASON_POINTS) ?? undefined,
}
/** The game's colour for charged energy. */
const CHARGED = '#3ce0d0'

interface Row {
  id: string
  c: TrackedCharacter
  playing: boolean
  energy: CounterNow | null
  nightmare: CounterNow | null
  ascension: CounterNow | null
  corridors: CorridorState[]
  /** Kina and bound Kina: live for the one playing, as last seen for the others; null while never seen. */
  kina: number | null
  boundKina: number | null
  /** The two together; null while neither was seen. */
  kinaTotal: number | null
  /** The Shugo Festival's games since the weekly reset (the season mission Festival-Loving Daeva). */
  shugoWeek: number
  /** The Oath Coins and Abyss Points, as last seen; null while never seen. */
  oath: number | null
  abyss: number | null
  /** The season's weekly progress this week (0 after the reset); null while never seen. */
  week: number | null
}

/** What a server's characters share, with each one's bar colour. */
const SHARED: { r: Refill; bar: string }[] = [
  { r: DAILY_DUNGEON, bar: 'bg-sky-400' },
  { r: SHUGO_KEYS, bar: 'bg-pink-400' },
  { r: INVASION_KEYS, bar: 'bg-red-400' },
]

/** By server (the one playing first), each in the game's order. */
/** Each character's Shugo Festival games since the weekly reset, from every session kept. */
/** The season mission's last step: the week's games done. */
const SHUGO_DONE = SHUGO_MISSION.steps.at(-1)!
const shugoWeek = computed(() =>
  runsSince([...(store.sessions.current ? [store.sessions.current] : []), ...store.sessions.history], 'shugo', lastRefill(WEEKLY_RESET, now.value)),
)
const servers = computed(() => {
  const playing = store.status?.character && store.status.server ? characterId(store.status.server, store.status.character) : null
  const rows: Row[] = Object.entries(store.characters).map(([id, c]) => {
    const kina = id === playing && store.kina.balance !== null ? store.kina.balance : (c.kina?.balance ?? null)
    const boundKina = c.boundKina?.balance ?? null
    return {
      id,
      c,
      playing: id === playing,
      energy: counterNow(ENERGY, c.counters, now.value),
      nightmare: counterNow(NIGHTMARE, c.counters, now.value),
      ascension: counterNow(ASCENSION, c.counters, now.value),
      corridors: corridorStates(c.corridors, now.value, corridorOffer(Object.values(store.characters), c.server, now.value)),
      kina,
      boundKina,
      kinaTotal: kina === null && boundKina === null ? null : (kina ?? 0) + (boundKina ?? 0),
      shugoWeek: shugoWeek.value.get(id) ?? 0,
      oath: c.seasonPoints?.balance ?? null,
      abyss: c.abyssPoints?.balance ?? null,
      week: seasonWeekNow(c, now.value),
    }
  })
  const by = new Map<number, Row[]>()
  for (const r of rows) by.set(r.c.server, [...(by.get(r.c.server) ?? []), r])
  return [...by.entries()]
    .map(([server, list]) => ({
      server,
      rows: list.sort((a, b) => a.c.order - b.c.order || a.c.name.localeCompare(b.c.name)),
      shared: SHARED.map(({ r, bar }) => ({ r, bar, c: sharedNow(r, list.map((x) => x.c.counters), now.value) })),
    }))
    .sort((a, b) => Number(b.rows.some((r) => r.playing)) - Number(a.rows.some((r) => r.playing)) || a.server - b.server)
})
/** The account's memberships: one for every character. */
const memberships = computed(() => membershipsNow(Object.values(store.characters), now.value))
const tracked = computed(() => Object.values(store.characters).filter((c) => c.counters).length)
const total = computed(() => Object.keys(store.characters).length)

/** Characters being asked again (the refresh button). */
const refreshing = ref(new Set<string>())
async function refresh(id: string): Promise<void> {
  refreshing.value = new Set(refreshing.value).add(id)
  try {
    await bridge().invoke('characters:refresh', id)
  } finally {
    const next = new Set(refreshing.value)
    next.delete(id)
    refreshing.value = next
  }
}

const num = (n: number | null): string => (n === null ? '–' : n.toLocaleString('en-US'))

const ago = (at: number): string => timeAgo(at, now.value)
/** A membership's time left: days, or hours in its last day. */
function left(end: number): string {
  const h = Math.floor((end - now.value) / 3_600_000)
  return h >= 24 ? plural(Math.floor(h / 24), '{n} day left', '{n} days left') : plural(Math.max(1, h), '{n} hour left', '{n} hours left')
}
const stamp = weekdayTime

/** What a counter's number is: as read, or worked out since. */
function counterTitle(r: Refill, c: CounterNow): string {
  const lines = [t(c.changed ? '{n} after your last run, {when}' : '{n} at login, {when}', { n: c.read, when: ago(c.readAt) })]
  if (c.now !== c.read) lines.push(t('+{per} {when} since', { per: r.per, when: t(r.when) }))
  lines.push(c.now >= c.max ? t('Full') : t('Full at {when}', { when: stamp(c.fullAt) }))
  return lines.join('\n')
}
const pct = (c: CounterNow): number => Math.min(100, (c.now / c.max) * 100)

/** Corridors: each one's state, in words, for the tooltip. */
const CORRIDOR: Record<CorridorState, string> = {
  open: 'still to do',
  done: 'done',
  unknown: 'not seen since the reset (likely still to do: enter the Abyss to check)',
  closed: 'not open this time (seen by a character of the server)',
}
const corridorsLeft = (list: CorridorState[]): number => list.filter((x) => x !== 'done' && x !== 'closed').length
function corridorTitle(list: CorridorState[]): string {
  const lines = CORRIDORS.map((k, i) => `${k.name}: ${t(CORRIDOR[list[i]!])}`)
  lines.push(t('Back {when}', { when: stamp(nextCorridorReset(now.value)) }))
  return lines.join('\n')
}
</script>

<template>
  <div>
    <PageHeader
      title="Characters"
      about="Every character of your account, from the character selection screen. Log in to each one once with the overlay on to track its energy and entries: they are read at each login and refilled on the game's schedule in between."
    >
      <span
        v-for="m in memberships"
        :key="m.name"
        :class="['rounded-full border px-3 py-1 text-xs font-semibold', m.end - now < 3 * 86_400_000 ? 'border-yellow/40 bg-yellow/10 text-yellow' : 'border-accent/40 bg-accent/10 text-accent']"
        :title="t('Ends {when}', { when: stamp(m.end) })"
      >
        {{ t(m.name) }}, {{ left(m.end) }}
      </span>
      <span v-if="total" class="rounded-full border border-card bg-card px-3 py-1 text-xs text-darker">
        {{ t('{n} of {total} tracked', { n: tracked, total }) }}
      </span>
    </PageHeader>

    <div v-if="!total" class="flex flex-col items-center gap-2 rounded-xl border border-dashed border-card px-6 py-14 text-center">
      <svg viewBox="0 0 16 16" class="size-8 text-darkest" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 7a2 2 0 1 0 0-4M12.5 9.7c1.2.6 2 1.9 2 3.3" />
      </svg>
      <div class="text-sm font-medium">{{ t('No characters yet') }}</div>
      <div class="max-w-md text-sm text-darker">{{ t('With the overlay open, go to the character selection screen in game: your characters show here.') }}</div>
    </div>

    <section v-for="s in servers" :key="s.server" class="mb-8">
      <h2 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-darker">
        {{ serverLabel(s.server) || s.server }}
      </h2>

      <!-- The roster: who they are. -->
      <div class="mb-4 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3">
        <div
          v-for="r in s.rows"
          :key="r.id"
          :class="[
            'group relative overflow-hidden rounded-xl border bg-card transition',
            r.playing ? 'border-accent shadow-[0_0_0_1px_var(--accent)]' : 'border-card',
            !r.c.counters && 'opacity-60',
          ]"
        >
          <div class="relative aspect-[4/5] overflow-hidden bg-dark">
            <img
              v-if="r.c.portrait"
              :src="r.c.portrait"
              alt=""
              draggable="false"
              :class="['size-full object-cover object-top transition', !r.c.counters && 'grayscale']"
            />
            <div v-else class="flex size-full items-center justify-center">
              <ClassIcon :class-name="r.c.className" :size="56" :class="['opacity-40', !r.c.counters && 'grayscale']" />
            </div>
            <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#111113] via-[#111113]/70 to-transparent" />
            <div class="absolute left-2 top-2 flex items-center gap-1">
              <span v-if="r.playing" class="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">{{ t('Playing') }}</span>
              <button
                type="button"
                :disabled="refreshing.has(r.id)"
                :class="[
                  'flex size-6 items-center justify-center rounded-full bg-black/60 text-default backdrop-blur-sm transition hover:bg-accent disabled:cursor-wait',
                  r.c.portrait && !refreshing.has(r.id) ? 'opacity-0 group-hover:opacity-100' : '',
                ]"
                :title="t('Ask NCSoft again for the portrait and combat power')"
                @click="refresh(r.id)"
              >
                <svg viewBox="0 0 16 16" :class="['size-3.5', refreshing.has(r.id) && 'animate-spin']" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
                </svg>
              </button>
            </div>
            <span v-if="r.c.level" class="absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-default backdrop-blur-sm">Lv {{ r.c.level }}</span>
            <div class="absolute inset-x-0 bottom-0 px-3 pb-2.5">
              <div class="flex items-center gap-1.5">
                <ClassIcon :class-name="r.c.className" :size="18" />
                <span class="truncate text-[15px] font-semibold leading-tight">{{ r.c.name }}</span>
              </div>
              <div class="truncate text-[11px] text-darker">{{ r.c.className ?? '' }}<template v-if="r.c.legion"> · {{ r.c.legion }}</template></div>
            </div>
          </div>
          <div class="grid grid-cols-2 divide-x divide-[color:var(--line)] border-t border-card text-center">
            <div class="px-2 py-1.5" :title="t('Gear score')">
              <div class="text-[10px] uppercase tracking-wide text-darkest">{{ t('Gear') }}</div>
              <div class="text-sm font-semibold tabular-nums">{{ num(r.c.gearScore) }}</div>
            </div>
            <div class="px-2 py-1.5" :title="t('Combat power, from NCSoft\'s site')">
              <div class="text-[10px] uppercase tracking-wide text-darkest">CP</div>
              <div class="text-sm font-semibold tabular-nums text-yellow">{{ num(r.c.combatPower) }}</div>
            </div>
          </div>
          <div v-if="!r.c.counters" class="border-t border-card bg-dark/60 px-3 py-1.5 text-center text-[11px] font-medium text-darker">
            {{ t('Log in to track it') }}
          </div>
          <div v-else-if="r.energy" class="flex items-center gap-1.5 border-t border-card bg-dark/60 px-3 py-1.5 text-[11px] tabular-nums" :title="t('Odyle Energy')">
            <img :src="ICONS.energy" alt="" draggable="false" class="size-4 shrink-0" />
            <span class="font-semibold">{{ r.energy.now }}</span>
            <span v-if="r.energy.extra" class="font-semibold" :style="{ color: CHARGED }">(+{{ r.energy.extra }})</span>
            <span class="ml-auto text-darkest">/ {{ r.energy.max }}</span>
          </div>
        </div>
      </div>

      <!-- Shared by the server's characters: one value for all of them. -->
      <div v-if="s.shared.some((x) => x.c)" class="mb-4 grid grid-cols-3 gap-3">
        <div v-for="x in s.shared" :key="x.r.id" class="rounded-xl border border-card bg-card px-4 py-2.5" :title="x.c ? counterTitle(x.r, x.c) : ''">
          <div class="mb-1.5 flex items-baseline gap-1.5 tabular-nums">
            <span class="text-xs font-medium uppercase tracking-wide text-darker">{{ t(x.r.label) }}</span>
            <template v-if="x.c">
              <span class="ml-2 font-semibold">{{ x.c.now }}</span>
              <span class="text-xs text-darkest">/ {{ x.c.max }}</span>
              <span class="ml-auto text-[11px] text-darker">
                <template v-if="x.c.now >= x.c.max">{{ t('Full') }}</template>
                <template v-else>+{{ x.r.per }} <Countdown :at="x.c.nextAt" :now="now" /></template>
              </span>
            </template>
            <span v-else class="ml-auto text-darkest">–</span>
          </div>
          <div v-if="x.c" class="flex gap-0.5">
            <span v-for="i in x.c.max" :key="i" :class="['h-1.5 flex-1 rounded-full', i <= x.c.now ? x.bar : 'bg-dark']" />
          </div>
        </div>
      </div>

      <!-- At a glance: energy and entries. -->
      <div class="overflow-hidden rounded-xl border border-card">
        <table class="w-full text-sm">
          <thead class="bg-card text-xs uppercase tracking-wide text-darker">
            <tr class="border-b border-card">
              <th class="py-2.5 pl-4 text-left font-medium">{{ t('Character') }}</th>
              <th class="min-w-[15rem] px-3 text-left font-medium">
                <span class="flex items-center gap-1.5"><img :src="ICONS.energy" alt="" draggable="false" class="size-5" />{{ t('Odyle Energy') }}</span>
              </th>
              <th class="w-48 whitespace-nowrap px-5 text-left font-medium">
                <span class="flex items-center gap-1.5"><img :src="ICONS.ticket" alt="" draggable="false" class="size-5" />Nightmare</span>
              </th>
              <th class="w-48 whitespace-nowrap px-5 text-left font-medium">
                <span class="flex items-center gap-1.5"><img :src="ICONS.ticket" alt="" draggable="false" class="size-5" />{{ t('Ascension Trial') }}</span>
              </th>
              <th class="w-px whitespace-nowrap px-4 text-right font-medium" :title="t('The season: the weekly rewards\' bar (back to 0 at the weekly reset, Wednesday 07:00 UTC), and the Shugo Festival\'s games this week for the mission Festival-Loving Daeva.')">{{ t('Season (week)') }}</th>
              <th class="w-px whitespace-nowrap px-4 text-right font-medium" :title="t('Kina (and bound Kina), Abyss Points, Oath Coins, Phantasmal Fragments and Centuryroot Tokens, as last seen')">{{ t('Wallet') }}</th>
              <th class="w-40 whitespace-nowrap px-5 text-center font-medium" :title="t('The Abyss\'s Artifact corridors, back as the Artifact siege starts (Thursdays and Saturdays at 21:00 in Europe).')">{{ t('Corridors') }}</th>
              <th class="w-px whitespace-nowrap pl-5 pr-4 text-right font-medium">{{ t('Last read') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[color:var(--line)]">
            <tr v-for="r in s.rows" :key="r.id" :class="['hover:bg-card', !r.c.counters && 'text-darker']">
              <td class="py-2.5 pl-4">
                <div class="flex items-center gap-2.5">
                  <img v-if="r.c.portrait" :src="r.c.portrait" alt="" draggable="false" :class="['size-8 shrink-0 rounded-full border border-card object-cover object-top', !r.c.counters && 'opacity-50 grayscale']" />
                  <span v-else class="flex size-8 shrink-0 items-center justify-center rounded-full border border-card bg-dark"><ClassIcon :class-name="r.c.className" :size="16" /></span>
                <span class="font-medium">{{ r.c.name }}</span>
                  <span v-if="r.playing" class="size-1.5 rounded-full bg-accent" :title="t('Playing')" />
                </div>
              </td>
              <template v-if="r.c.counters">
                <td class="px-3 py-2">
                  <!-- Three lines, each on one line: the energy and the next refill; the bar; how much
                       came since login and when it is full. -->
                  <div v-if="r.energy" class="whitespace-nowrap tabular-nums" :title="counterTitle(ENERGY, r.energy)">
                    <div class="mb-1 flex items-baseline gap-1.5">
                      <span class="font-semibold">{{ r.energy.now }}</span>
                      <span v-if="r.energy.extra" class="font-semibold" :style="{ color: CHARGED }">(+{{ r.energy.extra }})</span>
                      <span class="text-xs text-darkest">/ {{ r.energy.max }}</span>
                      <span v-if="r.energy.now < r.energy.max" class="ml-auto text-[11px] text-darker">+{{ ENERGY.per }} {{ t('in') }} <Countdown :at="r.energy.nextAt" :now="now" /></span>
                    </div>
                    <div class="h-1.5 overflow-hidden rounded-full bg-dark">
                      <div class="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" :style="{ width: `${pct(r.energy)}%` }" />
                    </div>
                    <div class="mt-1 flex items-baseline gap-1.5 text-[11px] text-darker">
                      <span v-if="r.energy.now !== r.energy.read">{{ t('~{n} since login', { n: `+${r.energy.now - r.energy.read}` }) }}</span>
                      <span v-if="r.energy.now >= r.energy.max" class="ml-auto font-semibold text-yellow">{{ t('Full: the next refill is lost') }}</span>
                      <span v-else class="ml-auto">{{ t('Full at {when}', { when: stamp(r.energy.fullAt) }) }} · <Countdown :at="r.energy.fullAt" :now="now" /></span>
                    </div>
                  </div>
                  <span v-else class="text-darkest">–</span>
                </td>
                <td v-for="[def, c] in ([[NIGHTMARE, r.nightmare], [ASCENSION, r.ascension]] as const)" :key="def.id" class="px-5 py-2">
                  <div v-if="c" :title="counterTitle(def, c)">
                    <div class="mb-1 flex items-baseline gap-1 tabular-nums">
                      <span class="font-semibold">{{ c.now }}</span>
                      <span class="text-xs text-darkest">/ {{ c.max }}</span>
                      <span class="ml-auto text-[11px] text-darker">
                        <template v-if="c.now >= c.max">{{ t('Full') }}</template>
                        <template v-else>+{{ def.per }} <Countdown :at="c.nextAt" :now="now" /></template>
                      </span>
                    </div>
                    <div class="flex gap-0.5">
                      <span
                        v-for="i in c.max"
                        :key="i"
                        :class="['h-1.5 flex-1 rounded-full', i <= c.now ? (def === NIGHTMARE ? 'bg-violet-400' : 'bg-amber-400') : 'bg-dark']"
                      />
                    </div>
                  </div>
                  <span v-else class="text-darkest">–</span>
                </td>
                <!-- The season: the weekly rewards' bar, and the week's Shugo games of Festival-Loving Daeva, a mark at each step (3, 6, 9). -->
                <td class="w-44 whitespace-nowrap px-4 py-2 tabular-nums">
                  <div v-if="r.week !== null" :title="r.c.seasonWeek ? t('Read {when}', { when: stamp(r.c.seasonWeek.at) }) : ''">
                    <div class="flex items-baseline gap-1">
                      <span :class="['font-semibold', r.week >= SEASON_WEEK_MAX && 'text-green']">{{ amount(r.week) }}</span>
                      <span class="text-xs text-darkest">/ {{ amount(SEASON_WEEK_MAX) }}</span>
                    </div>
                    <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-dark">
                      <div :class="['h-full rounded-full', r.week >= SEASON_WEEK_MAX ? 'bg-green' : 'bg-accent']" :style="{ width: `${Math.min(100, (r.week / SEASON_WEEK_MAX) * 100)}%` }" />
                    </div>
                  </div>
                  <span v-else class="text-darkest">–</span>
                  <div class="mt-1 flex items-center gap-1.5 text-[11px]" :title="t('Shugo Festival games since the weekly reset, {when}', { when: stamp(lastRefill(WEEKLY_RESET, now)) })">
                    <span class="text-darker">Shugo</span>
                    <span :class="r.shugoWeek >= SHUGO_DONE ? 'font-semibold text-green' : r.shugoWeek ? 'text-default' : 'text-darkest'">{{ r.shugoWeek }}/{{ SHUGO_DONE }}</span>
                    <span class="flex gap-0.5">
                      <span
                        v-for="step in SHUGO_MISSION.steps"
                        :key="step"
                        :class="['h-1.5 w-3 rounded-full', r.shugoWeek >= step ? 'bg-green' : 'bg-dark']"
                        :title="t('{n} games: {reward}', { n: step, reward: SHUGO_MISSION.reward })"
                      />
                    </span>
                  </div>
                </td>
                <!-- The wallet: Kina (with bound), Abyss Points, Oath Coins, each its icon. -->
                <td class="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
                  <div class="flex flex-col items-end gap-0.5 text-xs">
                    <span
                      class="flex items-center gap-1 font-semibold"
                      :title="r.kinaTotal !== null ? t('{kina} Kina, {bound} bound', { kina: r.kina === null ? '?' : formatKina(r.kina), bound: r.boundKina === null ? '?' : formatKina(r.boundKina) }) : ''"
                    >
                      {{ r.kinaTotal !== null ? formatKina(r.kinaTotal) : '–' }}<img :src="ICONS.kina" alt="" draggable="false" class="size-4" />
                    </span>
                    <span class="flex items-center gap-1" :title="t('Abyss Points')">{{ r.abyss !== null ? formatKina(r.abyss) : '–' }}<img :src="ICONS.abyss" alt="" draggable="false" class="size-4" /></span>
                    <!-- Phantasmal Fragments, Centuryroot Tokens. -->
                    <span v-for="id in WALLET_MORE" :key="id" class="flex items-center gap-1" :title="itemInfo(id)?.name">{{ r.c.wallet?.[id] ? amount(r.c.wallet[id]!.balance) : '–' }}<img :src="currencyIcon(id) ?? undefined" alt="" draggable="false" class="size-4" /></span>
                    <span class="flex items-center gap-1" :title="r.c.seasonPoints ? `${t('Oath Coins')} · ${t('Read {when}', { when: stamp(r.c.seasonPoints.at) })}` : t('Oath Coins')">{{ r.oath !== null ? amount(r.oath) : '–' }}<img :src="ICONS.oath" alt="" draggable="false" class="size-4" /></span>
                  </div>
                </td>
                <td class="px-5 py-2" :title="corridorTitle(r.corridors)">
                  <div class="flex items-center justify-center gap-2">
                    <div class="flex gap-1">
                      <!-- A corridor not open this time: not shown. -->
                      <span
                        v-for="(st, i) in r.corridors"
                        v-show="st !== 'closed'"
                        :key="i"
                        :class="[
                          'size-3 rounded-full',
                          st === 'open' ? 'bg-sky-400' : st === 'done' ? 'bg-dark' : 'border border-dashed border-sky-400/70',
                        ]"
                      />
                    </div>
                    <span :class="['text-xs tabular-nums', corridorsLeft(r.corridors) ? 'text-default' : 'text-darkest']">
                      {{ corridorsLeft(r.corridors) ? t('{n} left', { n: corridorsLeft(r.corridors) }) : t('Done') }}
                    </span>
                  </div>
                </td>
                <td class="whitespace-nowrap pl-5 pr-4 text-right text-xs text-darker">{{ ago(r.c.counters.at) }}</td>
              </template>
              <td v-else colspan="6" class="px-3 py-2 text-xs">
                <span class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-light px-2.5 py-1 text-darker">
                  <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2.5h2.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10M6.5 11 9.5 8l-3-3M9.5 8H2.5" /></svg>
                  {{ t('Log in with {name} once to start tracking it', { name: r.c.name }) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Expeditions: each character's cubes toward the guaranteed chests. -->
      <CharacterExpeditions :characters="s.rows.map((r) => ({ id: r.id, name: r.c.name, className: r.c.className }))" :state="expeditions" />
    </section>
  </div>
</template>
