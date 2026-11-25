<script setup lang="ts">
// Personal bests, a tab per kind of content (Expeditions, Nightmares, Awakening...), all characters or
// one picked (remembered).
// - Most kinds: the best DPS on each boss (the engine keeps them apart from the fights: a pruned fight
//   does not take one away), by dungeon and mode, with your item level and combat power in that fight;
//   or the fastest run of each dungeon and mode (the sessions' runs: from the entry to the last boss).
// - Nightmares: a grid, a row per boss, a column per level (1 to 10, the session's run telling it; a
//   fight without its level is left out), the best DPS or the fastest kill at each, from the fights
//   kept. A cell's fight can be deleted, or a whole level's (the low ones, once only level 10 is done).
// A best opens its fight in this page.
import CharName from '@/components/CharName.vue'
import { onHistory } from '@/lib/history.ts'
import { compact } from '@shared/format.ts'
import { computed, ref } from 'vue'
import DetailsPage from '@/pages/DetailsPage.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, t } from '@/lib/i18n.ts'
import { useStored } from '@/lib/now.ts'
import { useApp } from '@/stores/app.ts'
import type { Best, Encounter, FightSummary, FightYou } from '@shared/meter.ts'
import { runKindLabel, zoneMode } from '@shared/sessions.ts'
import { ZONES } from '@shared/zones.ts'
import { DUNGEONS } from '@shared/dungeons.ts'
import { OPEN_EXPEDITIONS } from '@shared/expeditions.ts'

const store = useApp()
const api = bridge()
const bests = ref<Encounter[] | null>(null)
const fights = ref<FightSummary[]>([])
/** You in each best's fight: your item level and combat power then. */
const you = ref<Record<string, FightYou>>({})

const NIGHTMARE = 'bosschallenge'
/** Kinds where only the clear time counts (the Ascension Trials). */
const FAST_ONLY = ['awaken']
const NOT_TIMED = ['fieldevent', 'shugo', 'invasion', 'fieldboss', 'hiddencube', 'other']
const kindOf = (world: number): string => ZONES[world]?.[2] ?? 'other'
const kindLabel = (kind: string): string => (kind === 'party' ? 'Expeditions' : runKindLabel(kind))

// ---- the sessions' runs: a Nightmare's level, each dungeon's fastest ---------------------------------

const allRuns = computed(() =>
  [...store.sessions.history, ...(store.sessions.current ? [store.sessions.current] : [])].flatMap((s) => (s.runs ?? []).map((r) => ({ ...r, character: s.name }))),
)
/** A Nightmare's level at a moment, in an instance: the session's run it was in. */
const levelAt = (world: number, at: number): number | null =>
  allRuns.value.find((r) => r.level !== undefined && r.world === world && at >= r.start && at <= (r.end ?? Infinity))?.level ?? null

// ---- whose ------------------------------------------------------------------------------------------

const shown = computed(() => (bests.value ?? []).filter((e) => e.myDps || e.fastest))
const nightmareFights = computed(() =>
  fights.value
    .filter((f) => kindOf(f.dungeonId) === NIGHTMARE && (f.outcome ?? 'kill') === 'kill' && (f.myDamage ?? 0) > 0)
    .map((f) => ({ ...f, level: levelAt(f.dungeonId, f.startTimeMs) }))
    .filter((f): f is typeof f & { level: number } => f.level !== null),
)
const characters = computed(() =>
  [...new Set([...shown.value.map((e) => e.character), ...nightmareFights.value.map((f) => f.myName ?? ''), ...allRuns.value.filter((r) => r.cleared !== undefined).map((r) => r.character)])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b)),
)
const who = useStored<string | null>('bests.who', null, (raw) => (typeof raw === 'string' ? raw : null))
const picked = computed(() => (who.value && characters.value.includes(who.value) ? who.value : null))
const mine = (name: string | undefined): boolean => !picked.value || name === picked.value

// ---- the tabs -----------------------------------------------------------------------------------------

const timedRuns = computed(() => allRuns.value.filter((r) => r.started !== undefined && r.cleared !== undefined && r.cleared > r.started && ZONES[r.world]))
const kinds = computed(() => {
  const set = new Set([...shown.value.map((e) => kindOf(e.dungeonId)), ...timedRuns.value.map((r) => kindOf(r.world))])
  if (nightmareFights.value.length) set.add(NIGHTMARE)
  // Not dungeons to be fastest in: festivals' games, invasions, field events.
  for (const k of NOT_TIMED) set.delete(k)
  const order = ['party', NIGHTMARE]
  return [...set].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b))
})
const tab = useStored<string>('bests.tab', 'party', (raw) => (typeof raw === 'string' ? raw : 'party'))
const kind = computed(() => (kinds.value.includes(tab.value) ? tab.value : (kinds.value[0] ?? 'party')))
const tabs = computed(() => kinds.value.map((k) => ({ id: k, label: kindLabel(k) })))
/** What a tab ranks by: the best DPS, or the fastest (a run; a Nightmare's kill); the Ascension Trials by their time alone. */
const metric = useStored<'dps' | 'fast'>('bests.metric', 'dps', (raw) => (raw === 'fast' ? 'fast' : 'dps'))
const by = computed(() => (FAST_ONLY.includes(kind.value) ? 'fast' : metric.value))
const METRICS = computed(() => [
  { id: 'dps' as const, label: 'Best DPS' },
  { id: 'fast' as const, label: kind.value === NIGHTMARE ? 'Fastest kill' : 'Fastest run' },
])

/** A dungeon as the game names it, with its mode ("Vakron Sky Island · Normal"). */
function dungeonName(id: number): string {
  const name = ZONES[id]?.[0] ?? `#${id}`
  const mode = zoneMode(id, t)
  return mode ? `${name} · ${mode}` : name
}

// ---- best DPS by boss ----------------------------------------------------------------------------------

const byDungeon = computed(() => {
  const by = new Map<number, Encounter[]>()
  for (const e of shown.value) if (kindOf(e.dungeonId) === kind.value && mine(e.character)) by.set(e.dungeonId, [...(by.get(e.dungeonId) ?? []), e])
  return [...by]
    .sort((a, b) => a[0] - b[0])
    .map(([id, list]) => ({ id, name: dungeonName(id), list: list.sort((a, b) => a.bossName.localeCompare(b.bossName) || a.character.localeCompare(b.character)) }))
})

// ---- fastest run by dungeon ------------------------------------------------------------------------------

/** Each character's fastest run of each dungeon and mode (all of them, or the one picked). */
const fastest = computed(() => {
  const best = new Map<string, (typeof timedRuns.value)[number]>()
  for (const r of timedRuns.value) {
    if (kindOf(r.world) !== kind.value || !mine(r.character)) continue
    const key = `${r.world}|${r.character}`
    const was = best.get(key)
    if (!was || r.cleared! - r.started! < was.cleared! - was.started!) best.set(key, r)
  }
  return [...best.values()].sort((a, b) => a.world - b.world || a.cleared! - a.started! - (b.cleared! - b.started!))
})
const clearMs = (r: { started?: number; cleared?: number }): number => r.cleared! - r.started!

// ---- Expeditions: a dungeon per row, a mode per column ----------------------------------------------------

const MODES = [
  { id: 'easy', label: 'Exploration' },
  { id: 'normal', label: 'Conquest Normal' },
  { id: 'advanced', label: 'Conquest Hard' },
]
/**
 * A fixed grid: every open expedition (and any other with a best), every boss of it in the game's order
 * (shared/dungeons.ts, the final one last), a mode per column; the cells with a best filled: each
 * character's fastest run on the expedition's line, each character's best DPS on a boss's, the best first.
 */
const expeditions = computed(() => {
  type Run = (typeof timedRuns.value)[number]
  const runs = new Map<string, Run[]>()
  const dps = new Map<string, Encounter[]>()
  const modeOf = (world: number): string | null => {
    const z = ZONES[world]
    return z && MODES.some((m) => m.id === z[3]) ? `${z[0]}|${z[3]}` : null
  }
  for (const r of fastest.value) {
    const k = modeOf(r.world)
    if (k) runs.set(k, [...(runs.get(k) ?? []), r])
  }
  const met = new Map<string, Set<string>>()
  for (const d of byDungeon.value) {
    const k = modeOf(d.id)
    if (!k) continue
    for (const e of d.list) {
      if (!e.myDps) continue
      const key = `${k}|${e.bossName}`
      dps.set(key, [...(dps.get(key) ?? []), e].sort((x, y) => y.myDps!.value - x.myDps!.value))
      const name = ZONES[d.id]![0]
      met.set(name, (met.get(name) ?? new Set()).add(e.bossName))
    }
  }
  const names = [...OPEN_EXPEDITIONS, ...[...met.keys(), ...[...runs.keys()].map((k) => k.split('|')[0]!)].filter((n) => !OPEN_EXPEDITIONS.includes(n))]
  return [...new Set(names)].map((name) => {
    const known = DUNGEONS.expedition[name] ?? []
    const bosses = [...known, ...[...(met.get(name) ?? [])].filter((b) => !known.includes(b))]
    return {
      name,
      fast: Object.fromEntries(MODES.map((m) => [m.id, runs.get(`${name}|${m.id}`) ?? []])),
      bosses: bosses.map((b, i) => ({
        name: b,
        final: i === known.length - 1,
        bests: Object.fromEntries(MODES.map((m) => [m.id, dps.get(`${name}|${m.id}|${b}`) ?? []])),
      })),
    }
  })
})

// ---- Nightmares: a boss's row, a level's column ------------------------------------------------------------

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1)
const dpsOf = (f: FightSummary): number => (f.myDamage ?? 0) / Math.max(1, f.durationMs / 1000)
const grid = computed(() => {
  const rows = new Map<string, Map<number, (typeof nightmareFights.value)[number]>>()
  for (const f of nightmareFights.value) {
    if (!mine(f.myName)) continue
    const row = rows.get(f.bossName) ?? new Map()
    const was = row.get(f.level)
    const better = !was || (metric.value === 'dps' ? dpsOf(f) > dpsOf(was) : f.durationMs < was.durationMs)
    if (better) row.set(f.level, f)
    rows.set(f.bossName, row)
  }
  return [...rows].sort((a, b) => a[0].localeCompare(b[0])).map(([boss, cells]) => ({ boss, cells }))
})
/** A Nightmare boss's colour, as the game's tiers: Notun and Gerod green, Zikel blue, the others grey. */
const bossTone = (boss: string): string => (/Notun|Gerod/.test(boss) ? 'text-green' : /Zikel/.test(boss) ? 'text-blue' : 'text-darker')
/** Delete asks once: the first click arms it for 3 seconds, the second deletes. */
const arming = ref<string | null>(null)
let armTimer: ReturnType<typeof setTimeout> | null = null
function confirmThen(key: string, act: () => void): void {
  if (armTimer) clearTimeout(armTimer)
  if (arming.value !== key) {
    arming.value = key
    armTimer = setTimeout(() => (arming.value = null), 3000)
    return
  }
  arming.value = null
  act()
}
const deleteFight = (id: string): void => confirmThen(id, () => void api.invoke('history:delete', id))
/** Every fight of a level (the characters shown), not only the best kept in the grid. */
const deleteLevel = (level: number): void =>
  confirmThen(`level-${level}`, () => {
    for (const f of nightmareFights.value) if (f.level === level && mine(f.myName)) void api.invoke('history:delete', f.id)
  })

// ---- formats, the fight open ---------------------------------------------------------------------------------

const mmss = (ms: number): string => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const day = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'short' })
const gear = (id: string | undefined): string | null => {
  const g = id ? you.value[id] : undefined
  if (!g || (!g.gearScore && !g.combatPower)) return null
  return [g.gearScore ? `ilvl ${g.gearScore}` : null, g.combatPower ? `${compact(g.combatPower)} CP` : null].filter(Boolean).join(' · ')
}
const opened = ref<string | null>(null)
const open = (b: Best | null): void => void (b && (opened.value = b.fightId))
const rowFight = (e: Encounter): Best | null => e.myDps ?? e.fastest ?? e.partyDps

async function load(): Promise<void> {
  const [b, f] = await Promise.all([api.invoke('history:bests'), api.invoke('history:list')])
  bests.value = b
  fights.value = f
  const ids = [...new Set([...b.flatMap((e) => [e.myDps?.fightId, e.fastest?.fightId]), ...nightmareFights.value.map((x) => x.id)].filter((x): x is string => !!x))]
  you.value = await api.invoke('history:you', ids)
}
onHistory(load)
</script>

<template>
  <DetailsPage v-if="opened" :key="opened" :source="{ kind: 'saved', id: opened }" @back="opened = null" />
  <div v-show="!opened">
    <PageHeader title="Personal bests" about="Your bests on each kind of content, each character: the best DPS on each boss or the fastest run, and for the Nightmares each level's. Click one for its fight." />

    <p v-if="bests === null" class="text-sm text-darker">{{ t('Loading…') }}</p>
    <div v-else-if="!kinds.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No personal best yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('Each dungeon boss you kill sets one.') }}</div>
    </div>
    <template v-else>
      <!-- What, whose, by what. -->
      <div class="mb-3 flex flex-wrap items-center gap-3">
        <Segmented v-model="tab" :options="tabs" size="sm" />
        <Segmented v-if="!FAST_ONLY.includes(kind)" v-model="metric" :options="METRICS" size="sm" />
      </div>
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
          <CharName :name="c" />
        </button>
      </div>

      <!-- Nightmares: a row per boss, a column per level. -->
      <div v-if="kind === NIGHTMARE" class="overflow-x-auto rounded-xl border border-card">
        <p v-if="!grid.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('No Nightmare with its level yet: the next ones you clear show here.') }}</p>
        <table v-else class="w-full text-sm tabular-nums">
          <thead class="bg-card text-xs text-darker">
            <tr>
              <th class="py-2 pl-4 text-left font-medium">{{ t('Boss') }}</th>
              <th v-for="l in LEVELS" :key="l" class="px-2 text-center font-medium">
                <span class="group/level inline-flex items-center gap-1">
                  {{ t('Lv {n}', { n: l }) }}
                  <button
                    v-if="grid.some((r) => r.cells.has(l))"
                    type="button"
                    :class="['text-[10px]', arming === `level-${l}` ? 'text-red' : 'text-darkest opacity-0 hover:text-red group-hover/level:opacity-100']"
                    :title="arming === `level-${l}` ? t('Click again to delete every fight of this level') : t('Delete every fight of this level')"
                    @click="deleteLevel(l)"
                  >✕</button>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in grid" :key="r.boss" class="border-t border-card">
              <td :class="['py-1.5 pl-4 font-medium', bossTone(r.boss)]">{{ r.boss }}</td>
              <td v-for="l in LEVELS" :key="l" class="px-2 py-1.5 text-center">
                <span v-if="r.cells.get(l)" class="group/cell relative inline-flex items-center gap-1">
                  <button
                    type="button"
                    class="font-semibold text-yellow hover:underline"
                    :title="[r.cells.get(l)!.myName, day(r.cells.get(l)!.startTimeMs), gear(r.cells.get(l)!.id)].filter(Boolean).join(' · ')"
                    @click="opened = r.cells.get(l)!.id"
                  >{{ metric === 'dps' ? compact(dpsOf(r.cells.get(l)!)) : mmss(r.cells.get(l)!.durationMs) }}</button>
                  <button
                    type="button"
                    :class="['text-[10px]', arming === r.cells.get(l)!.id ? 'text-red' : 'text-darkest opacity-0 hover:text-red group-hover/cell:opacity-100']"
                    :title="arming === r.cells.get(l)!.id ? t('Click again to delete this fight') : t('Delete this fight')"
                    @click="deleteFight(r.cells.get(l)!.id)"
                  >✕</button>
                </span>
                <span v-else class="text-darkest">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Expeditions: a fixed grid, every expedition and boss, a mode per column, the cells with a best filled. -->
      <div v-else-if="kind === 'party'">
        <div class="overflow-x-auto rounded-xl border border-card">
          <table class="w-full table-fixed text-sm tabular-nums">
            <colgroup>
              <col class="w-56" />
              <col v-for="m in MODES" :key="m.id" />
            </colgroup>
            <thead class="bg-card text-xs text-darker">
              <tr>
                <th class="py-2 pl-4 text-left font-medium">{{ t('Expedition') }}</th>
                <th v-for="m in MODES" :key="m.id" class="px-3 text-left font-medium">{{ t(m.label) }}</th>
              </tr>
            </thead>
            <tbody v-for="x in expeditions" :key="x.name" class="border-t border-light">
              <tr class="bg-card/50">
                <td class="py-1.5 pl-4 font-semibold">{{ x.name }}</td>
                <td v-for="m in MODES" :key="m.id" class="px-3 py-1.5">
                  <div v-if="by === 'fast' && x.fast[m.id]!.length" class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span v-for="r in x.fast[m.id]" :key="r.character" class="flex items-center gap-1" :title="day(r.start)">
                      <CharName v-if="picked === null" :name="r.character" class="text-dark" />
                      <span class="font-semibold text-yellow">{{ mmss(clearMs(r)) }}</span>
                    </span>
                  </div>
                  <span v-else-if="by === 'fast'" class="text-xs text-darkest">–</span>
                </td>
              </tr>
              <template v-if="by === 'dps'">
                <tr v-for="b in x.bosses" :key="b.name" class="border-t border-card">
                  <td :class="['py-1 pl-6 text-xs', b.final ? 'font-semibold text-red' : 'text-darker']" :title="b.final ? t('Final boss') : t('Sub-boss')">
                    <span class="flex items-center gap-1.5 truncate">
                      <span :class="['size-1.5 shrink-0 rounded-full', b.final ? 'bg-red' : 'bg-darkest']" />{{ b.name }}
                    </span>
                  </td>
                  <td v-for="m in MODES" :key="m.id" class="px-3 py-1 text-xs">
                    <span v-if="b.bests[m.id]!.length" class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span v-for="e in b.bests[m.id]" :key="e.character" class="flex items-center gap-1">
                        <CharName v-if="picked === null" :name="e.character" class="text-dark" />
                        <button type="button" class="font-semibold text-yellow hover:underline" :title="[day(e.myDps!.atMs), gear(e.myDps!.fightId)].filter(Boolean).join(' · ')" @click="open(e.myDps)">{{ compact(e.myDps!.value) }}</button>
                      </span>
                    </span>
                    <span v-else class="text-darkest">–</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p v-if="by === 'dps'" class="mt-2 flex items-center gap-4 text-[11px] text-darker">
          <span class="flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-red" />{{ t('Final boss') }}</span>
          <span class="flex items-center gap-1.5"><span class="size-1.5 rounded-full bg-darkest" />{{ t('Sub-boss') }}</span>
        </p>
      </div>

      <!-- The fastest run of each dungeon and mode. -->
      <div v-else-if="by === 'fast'" class="overflow-x-auto rounded-xl border border-card">
        <p v-if="!fastest.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('No cleared run yet: the runs your sessions keep, from the entry to the last boss.') }}</p>
        <table v-else class="w-full text-sm tabular-nums">
          <thead class="bg-card text-xs uppercase tracking-wide text-darker">
            <tr>
              <th class="py-2.5 pl-4 text-left font-medium">{{ t('Dungeon') }}</th>
              <th class="px-3 text-right font-medium">{{ t('Clear time') }}</th>
              <th v-if="picked === null" class="px-3 text-left font-medium">{{ t('Character') }}</th>
              <th class="px-3 pr-4 text-right font-medium">{{ t('Date') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in fastest" :key="`${r.world}|${r.character}`" class="border-t border-card">
              <td class="py-1.5 pl-4 font-medium">{{ dungeonName(r.world) }}</td>
              <td class="px-3 py-1.5 text-right font-semibold text-yellow">{{ mmss(clearMs(r)) }}</td>
              <td v-if="picked === null" class="px-3 py-1.5 text-dark"><CharName :name="r.character" /></td>
              <td class="px-3 py-1.5 pr-4 text-right text-darker">{{ day(r.start) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- The best DPS on each boss, by dungeon. -->
      <div v-else class="overflow-x-auto rounded-xl border border-card">
        <p v-if="!byDungeon.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('No personal best yet.') }}</p>
        <table v-else class="w-full text-sm tabular-nums">
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
              <td class="py-1.5 pl-4"><span :class="e.finalBoss && 'font-medium'">{{ e.bossName }}</span></td>
              <td v-if="picked === null" class="px-3 py-1.5 text-dark"><CharName :name="e.character" /></td>
              <td class="px-3 py-1.5 text-right">
                <button v-if="e.myDps" type="button" class="font-semibold text-yellow hover:underline" @click.stop="open(e.myDps)">{{ compact(e.myDps.value) }}</button>
                <span v-else class="text-darker">–</span>
                <span v-if="e.myDps" class="ml-1.5 text-[11px] text-darker">{{ day(e.myDps.atMs) }}</span>
                <div v-if="gear(e.myDps?.fightId)" class="text-[10px] text-darker">{{ gear(e.myDps?.fightId) }}</div>
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
