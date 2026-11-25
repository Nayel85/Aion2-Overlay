<script setup lang="ts">
// Personal bests, a tab per kind of content (Expeditions, Nightmares, Ascension Trials...), all characters or
// one picked (remembered). The Expeditions, Transcendences, Nightmares, Ascension Trials and Raids are
// fixed grids: every instance and boss the game has, the cells with a best filled.
// - Most kinds: the best DPS on each boss (the engine keeps them apart from the fights: a pruned fight
//   does not take one away), by dungeon and mode, with your item level and combat power in that fight;
//   or the fastest run of each dungeon and mode (the sessions' runs: from the entry to the last boss).
// - Nightmares: a grid, a row per boss, a column per level (1 to 10, the session's run telling it; a
//   fight without its level is left out), the best DPS or the fastest kill at each, from the fights
//   kept. A cell's fight can be deleted, or a whole level's (the low ones, once only level 10 is done).
// A best opens its fight in this page.
import { shortDate } from '@/lib/format.ts'
import { provideFightOpener, runClearFight } from '@/lib/fights.ts'
import FightLink from '@/components/FightLink.vue'
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
import { CONTENT, INSTANCES, NIGHTMARES, NIGHTMARE_LEVELS, NIGHTMARE_ZONE, CONTENT_ORDER, instanceAt, instanceIlvl, nightmareIlvl, type ContentKind, type NightmareGrade } from '@shared/instances.ts'
import { knownZone, zoneName, zoneType } from '@shared/worlds.ts'

const store = useApp()
const api = bridge()
const bests = ref<Encounter[] | null>(null)
const fights = ref<FightSummary[]>([])
/** You in each best's fight: your item level and combat power then. */
const you = ref<Record<string, FightYou>>({})

const NIGHTMARE = NIGHTMARE_ZONE
/** Kinds where only the clear time counts (the catalogue's: the Ascension Trials). */
const FAST_ONLY = (Object.keys(CONTENT) as ContentKind[]).filter((k) => CONTENT[k].timeOnly) as string[]
const NOT_TIMED = ['fieldevent', 'shugo', 'invasion', 'fieldboss', 'hiddencube', 'other']
/** A zone's tab: its kind of content in the catalogue (shared/instances.ts), else its dungeon type. */
const kindOf = (world: number): string => instanceAt(world)?.instance.kind ?? zoneType(world) ?? 'other'
const kindLabel = (kind: string): string => CONTENT[kind as ContentKind]?.label ?? runKindLabel(kind)

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
/** The characters a cell has a line for, each one's whether a record or not: the grids keep their shape. */
const lines = computed(() => (picked.value ? [picked.value] : characters.value))

// ---- the tabs -----------------------------------------------------------------------------------------

const timedRuns = computed(() => allRuns.value.filter((r) => r.started !== undefined && r.cleared !== undefined && r.cleared > r.started && knownZone(r.world)))
const kinds = computed(() => {
  const set = new Set([...shown.value.map((e) => kindOf(e.dungeonId)), ...timedRuns.value.map((r) => kindOf(r.world))])
  // The fixed grids, with a best or not.
  for (const k of [...Object.keys(CONTENT), NIGHTMARE]) set.add(k)
  // Not dungeons to be fastest in: festivals' games, invasions, field events.
  for (const k of NOT_TIMED) set.delete(k)
  const order = CONTENT_ORDER
  return [...set].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b))
})
const tab = useStored<string>('bests.tab', 'expedition', (raw) => (typeof raw === 'string' ? raw : 'expedition'))
const kind = computed(() => (kinds.value.includes(tab.value) ? tab.value : (kinds.value[0] ?? 'expedition')))
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
  const name = zoneName(id)
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

// ---- the fixed grids: the catalogue's instances (shared/instances.ts), a mode per column ---------------------

const gridDef = computed(() => CONTENT[kind.value as ContentKind] ?? null)

/** A mode's item level, in its column's header when every instance that has the mode asks the same (the Ascension Trials'). */
function headIlvl(mode: string): number | undefined {
  const levels = new Set(fixed.value.filter((x) => x.instance.worlds[mode] !== undefined).map((x) => instanceIlvl(x.instance, mode)))
  const [only] = [...levels]
  return levels.size === 1 ? only : undefined
}
/** A character's fastest run among a cell's. */
const fastOf = <R extends { character: string }>(runs: R[], who: string): R | undefined => runs.find((r) => r.character === who)
/** A character's best DPS among a cell's. */
const bestOf = (bests: Encounter[], who: string): Encounter | undefined => bests.find((e) => e.character === who)

/**
 * The tab's grid: every instance and boss of it (the game's order, the final boss last), the cells with a
 * best filled: each character's fastest run on the instance's line, each one's best DPS on a boss's, the
 * best first.
 */
const fixed = computed(() => {
  const def = gridDef.value
  if (!def) return []
  const content = kind.value as ContentKind
  type Run = (typeof timedRuns.value)[number]
  const runs = new Map<string, Run[]>()
  const dps = new Map<string, Encounter[]>()
  const met = new Map<string, Set<string>>()
  const key = (world: number): string | null => {
    const at = instanceAt(world)
    return at?.instance.kind === content ? `${at.instance.name}|${at.mode.id}` : null
  }
  for (const r of fastest.value) {
    const k = key(r.world)
    if (k) runs.set(k, [...(runs.get(k) ?? []), r])
  }
  for (const d of byDungeon.value) {
    const k = key(d.id)
    if (!k) continue
    const row = k.split('|')[0]!
    for (const e of d.list) {
      if (!e.myDps) continue
      dps.set(`${k}|${e.bossName}`, [...(dps.get(`${k}|${e.bossName}`) ?? []), e].sort((x, y) => y.myDps!.value - x.myDps!.value))
      met.set(row, (met.get(row) ?? new Set()).add(e.bossName))
    }
  }
  return INSTANCES[content].map((instance) => {
    const { name } = instance
    const bosses = instance.bosses.length ? instance.bosses : [...(met.get(name) ?? [])]
    return {
      instance,
      name,
      fast: Object.fromEntries(def.modes.map((c) => [c.id, runs.get(`${name}|${c.id}`) ?? []])),
      bosses: bosses.map((b, i) => ({
        name: b,
        final: i === instance.bosses.length - 1,
        bests: Object.fromEntries(def.modes.map((c) => [c.id, dps.get(`${name}|${c.id}|${b}`) ?? []])),
      })),
    }
  })
})

// ---- Nightmares: a boss's row, a level's column ------------------------------------------------------------

const LEVELS = NIGHTMARE_LEVELS
const dpsOf = (f: FightSummary): number => (f.myDamage ?? 0) / Math.max(1, f.durationMs / 1000)
type NightmareFight = (typeof nightmareFights.value)[number]
const grid = computed(() => {
  // By boss, by level, by character: their best.
  const rows = new Map<string, Map<number, Map<string, NightmareFight>>>()
  for (const f of nightmareFights.value) {
    if (!mine(f.myName) || !f.myName) continue
    const row = rows.get(f.bossName) ?? new Map<number, Map<string, NightmareFight>>()
    const cell = row.get(f.level) ?? new Map<string, NightmareFight>()
    const was = cell.get(f.myName)
    if (!was || (metric.value === 'dps' ? dpsOf(f) > dpsOf(was) : f.durationMs < was.durationMs)) cell.set(f.myName, f)
    row.set(f.level, cell)
    rows.set(f.bossName, row)
  }
  // Every Nightmare of the catalogue (the season's first), and any other a fight names.
  const extra = [...rows.keys()].filter((b) => !NIGHTMARES.some((n) => n.boss === b))
  return [...NIGHTMARES.map((n) => ({ boss: n.boss, grade: n.grade as NightmareGrade | null, season: n.season })), ...extra.map((boss) => ({ boss, grade: null, season: false }))].map((r) => ({
    ...r,
    cells: rows.get(r.boss) ?? new Map<number, Map<string, NightmareFight>>(),
  }))
})
/** The season on now, and the later ones, apart. */
const seasons = computed(() =>
  [
    { id: 'now', title: 'Current season', rows: grid.value.filter((r) => r.season) },
    { id: 'later', title: 'Later seasons', rows: grid.value.filter((r) => !r.season) },
  ].filter((s) => s.rows.length),
)
/** A Nightmare boss's colour, by its grade: the rares (Notun, Gerod) green, the legend (Zikel) blue, the commons grey. */
const GRADE_TONE: Record<NightmareGrade, string> = { common: 'text-dark', rare: 'text-green', legend: 'text-blue' }
const bossTone = (grade: NightmareGrade | null): string => (grade ? GRADE_TONE[grade] : 'text-darker')
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

const gear = (id: string | undefined): string | null => {
  const g = id ? you.value[id] : undefined
  if (!g || (!g.gearScore && !g.combatPower)) return null
  return [g.gearScore ? `ilvl ${g.gearScore}` : null, g.combatPower ? `${compact(g.combatPower)} CP` : null].filter(Boolean).join(' · ')
}
const opened = ref<string | null>(null)
// The fights open in this page (FightLink).
provideFightOpener((id) => (opened.value = id))
const open = (b: Best | null): void => void (b && (opened.value = b.fightId))
/** A run's clearing fight's id (lib/fights.ts), for its time's link. */
const clearFight = (r: { world: number; start: number; cleared?: number }): string | null => runClearFight(r, fights.value)?.id ?? null
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

      <!-- Nightmares: a table per season, a row per boss, a column per level, a line per character. -->
      <div v-if="kind === NIGHTMARE" class="space-y-4">
        <section v-for="season in seasons" :key="season.id">
          <h3 class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-darker">{{ t(season.title) }}</h3>
          <div class="overflow-x-auto rounded-xl border border-card">
            <table class="w-full table-fixed text-sm tabular-nums">
              <colgroup>
                <col class="w-56" />
                <col v-if="picked === null" class="w-28" />
                <col v-for="l in LEVELS" :key="l" />
              </colgroup>
              <thead class="bg-card text-xs text-darker">
                <tr>
                  <th class="py-2 pl-4 text-left font-medium">{{ t('Boss') }}</th>
                  <th v-if="picked === null" class="px-2 text-left font-medium">{{ t('Character') }}</th>
                  <th v-for="l in LEVELS" :key="l" class="px-1 text-center font-medium">
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
                <tr v-for="r in season.rows" :key="r.boss" class="border-t border-card">
                  <td :class="['py-1.5 pl-4 align-middle font-medium', bossTone(r.grade)]">{{ r.boss }}</td>
                  <td v-if="picked === null" class="px-2 py-1.5 align-top text-xs">
                    <div class="h-4" />
                    <div v-for="who in lines" :key="who" class="flex h-5 items-center"><CharName :name="who" class="text-dark" /></div>
                  </td>
                  <td v-for="l in LEVELS" :key="l" class="px-1 py-1.5 align-top text-center text-xs">
                    <div class="h-4 text-[10px] leading-4 text-darker" :title="nightmareIlvl(r.grade, l) ? t('Suggested item level: {n}', { n: nightmareIlvl(r.grade, l)! }) : undefined">
                      <template v-if="nightmareIlvl(r.grade, l)">ilvl {{ nightmareIlvl(r.grade, l) }}</template>
                    </div>
                    <div v-for="who in lines" :key="who" class="flex h-5 items-center justify-center gap-1">
                      <template v-if="r.cells.get(l)?.get(who)">
                        <span class="group/cell inline-flex items-center gap-0.5">
                          <FightLink
                            :as="metric === 'dps' ? 'dps' : 'time'"
                            :value="metric === 'dps' ? dpsOf(r.cells.get(l)!.get(who)!) : r.cells.get(l)!.get(who)!.durationMs"
                            :fight="r.cells.get(l)!.get(who)!.id"
                            :title="[who, shortDate(r.cells.get(l)!.get(who)!.startTimeMs), gear(r.cells.get(l)!.get(who)!.id)].filter(Boolean).join(' · ')"
                          />
                          <button
                            type="button"
                            :class="['text-[10px]', arming === r.cells.get(l)!.get(who)!.id ? 'text-red' : 'text-darkest opacity-0 hover:text-red group-hover/cell:opacity-100']"
                            :title="arming === r.cells.get(l)!.get(who)!.id ? t('Click again to delete this fight') : t('Delete this fight')"
                            @click="deleteFight(r.cells.get(l)!.get(who)!.id)"
                          >✕</button>
                        </span>
                      </template>
                      <span v-else class="text-darkest" :title="who">–</span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- A fixed grid: every instance and boss, a mode per column, the cells with a best filled. -->
      <div v-else-if="gridDef">
        <div class="overflow-x-auto rounded-xl border border-card">
          <table class="w-full table-fixed text-sm tabular-nums">
            <colgroup>
              <col class="w-72" />
              <col v-for="m in gridDef.modes" :key="m.id" />
            </colgroup>
            <thead class="bg-card text-xs text-darker">
              <tr>
                <th class="py-2 pl-4 text-left font-medium">{{ t(gridDef.head) }}</th>
                <th v-for="m in gridDef.modes" :key="m.id" class="px-3 text-left font-medium">
                  {{ t(m.label, { n: m.n ?? '' }) }}
                  <span v-if="headIlvl(m.id)" class="ml-1 font-normal text-darkest" :title="t('Item level asked to enter')">· ilvl {{ headIlvl(m.id) }}</span>
                </th>
              </tr>
            </thead>
            <tbody v-for="x in fixed" :key="x.name" class="border-t border-light">
              <tr class="bg-card/50">
                <td class="truncate py-1.5 pl-4 align-middle font-semibold" :title="x.name">{{ x.name }}</td>
                <td v-for="m in gridDef.modes" :key="m.id" class="px-3 py-1.5 align-top">
                  <template v-if="x.instance.worlds[m.id] !== undefined">
                    <div v-if="!headIlvl(m.id) && instanceIlvl(x.instance, m.id)" class="text-[10px] text-darker" :title="t('Item level asked to enter')">ilvl {{ instanceIlvl(x.instance, m.id) }}</div>
                    <template v-if="by === 'fast'">
                      <div v-for="who in lines" :key="who" class="flex h-5 items-center gap-2 text-xs">
                        <CharName v-if="picked === null" :name="who" class="w-24 shrink-0 text-dark" />
                        <FightLink v-if="fastOf(x.fast[m.id]!, who)" as="time" :value="clearMs(fastOf(x.fast[m.id]!, who)!)" :fight="clearFight(fastOf(x.fast[m.id]!, who)!)" :title="shortDate(fastOf(x.fast[m.id]!, who)!.start)" />
                        <span v-else class="text-darkest">–</span>
                      </div>
                    </template>
                  </template>
                </td>
              </tr>
              <template v-if="by === 'dps'">
                <tr v-for="b in x.bosses" :key="b.name" class="border-t border-card">
                  <td :class="['py-1 pl-6 align-middle text-xs', b.final ? 'font-semibold text-red' : 'text-darker']" :title="b.final ? t('Final boss') : t('Sub-boss')">
                    <span class="flex items-center gap-1.5 truncate">
                      <span :class="['size-1.5 shrink-0 rounded-full', b.final ? 'bg-red' : 'bg-darkest']" />{{ b.name }}
                    </span>
                  </td>
                  <td v-for="m in gridDef.modes" :key="m.id" class="px-3 py-1 align-top text-xs">
                    <template v-if="x.instance.worlds[m.id] !== undefined">
                      <div v-for="who in lines" :key="who" class="flex h-5 items-center gap-2">
                        <CharName v-if="picked === null" :name="who" class="w-24 shrink-0 text-dark" />
                        <FightLink
                          v-if="bestOf(b.bests[m.id]!, who)"
                          as="dps"
                          :value="bestOf(b.bests[m.id]!, who)!.myDps!.value"
                          :fight="bestOf(b.bests[m.id]!, who)!.myDps!.fightId"
                          :title="[shortDate(bestOf(b.bests[m.id]!, who)!.myDps!.atMs), gear(bestOf(b.bests[m.id]!, who)!.myDps!.fightId)].filter(Boolean).join(' · ')"
                        />
                        <span v-else class="text-darkest">–</span>
                      </div>
                    </template>
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
              <td class="px-3 py-1.5 text-right"><FightLink as="time" :value="clearMs(r)" :fight="clearFight(r)" /></td>
              <td v-if="picked === null" class="px-3 py-1.5 text-dark"><CharName :name="r.character" /></td>
              <td class="px-3 py-1.5 pr-4 text-right text-darker">{{ shortDate(r.start) }}</td>
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
                <FightLink v-if="e.myDps" as="dps" :value="e.myDps.value" :fight="e.myDps.fightId" />
                <span v-else class="text-darker">–</span>
                <span v-if="e.myDps" class="ml-1.5 text-[11px] text-darker">{{ shortDate(e.myDps.atMs) }}</span>
                <div v-if="gear(e.myDps?.fightId)" class="text-[10px] text-darker">{{ gear(e.myDps?.fightId) }}</div>
              </td>
              <td class="px-3 py-1.5 text-right">
                <FightLink v-if="e.partyDps" as="dps" :value="e.partyDps.value" :fight="e.partyDps.fightId" class="!font-normal !text-dark" />
                <span v-else class="text-darker">–</span>
              </td>
              <td class="px-3 py-1.5 pr-4 text-right">
                <FightLink v-if="e.fastest" as="time" :value="e.fastest.value" :fight="e.fastest.fightId" class="!font-normal !text-dark" />
                <span v-else class="text-darker">–</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
