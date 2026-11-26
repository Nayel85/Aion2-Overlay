<script setup lang="ts">
// One session, all of it at once (the Past sessions page's right side, the Session page's going-on
// one): who and when, its totals, where its Abyss Points and Kina came from, its other currencies,
// its dungeons by zone and mode (their runs in a table, what they gave in all as a row of icons; a
// run's own loot a click away), its field bosses, and its gathering; the latest first. `header`
// false: without who and when (the page above says it).
import CharName from '@/components/CharName.vue'
import { timeOfDay, longDate, lasting } from '@/lib/format.ts'
import { duration as mmss } from '@shared/format.ts'
import FightLink from '@/components/FightLink.vue'
import { fightDps, runFight, useFights } from '@/lib/fights.ts'
import { computed, ref } from 'vue'
import GatherStats from '@/components/panel/GatherStats.vue'
import RunLoot from '@/components/panel/RunLoot.vue'
import { CURRENCY_ICON, ICON, kindIcon, LOOT_KIND_STYLE } from '@/components/panel/sessionIcons.ts'
import { gradeClass } from '@/lib/grades.ts'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { characterId } from '@shared/characters.ts'
import { formatAmount } from '@shared/earnings.ts'
import { formatKina } from '@shared/kina.ts'
import { AP_ITEM, countedRuns, CURRENCY_LABELS, currencyIcon, KINA_ITEM, gatheredByResource, itemIcon, itemInfo, LOOT_KINDS, lootCounts, mergeRuns, runCounts, runGroups, runIsOneOff, runIsTimed, runKindLabel, runName, questName, runRewards, sourceLabel, type DungeonRun, type DutyDone, type GatheredResource, type PlaySession, type SupplyDone, supplyName } from '@shared/sessions.ts'
import { recipeOf } from '@shared/gather.ts'

const props = withDefaults(defineProps<{ session: PlaySession; live?: boolean; header?: boolean }>(), { live: false, header: true })
/** The saved fights: each run's best (your DPS on a boss in it, a Nightmare's boss). */
const fights = useFights()
const runBest = (r: DungeonRun) => runFight(r, fights.value)
const store = useApp()

/** A run's time: its clear time once its last boss fell, else how long you were in it. */
const runMs = (r: DungeonRun): number => (r.cleared !== undefined ? r.cleared - (r.started ?? r.start) : (r.end ?? r.start) - r.start)
const className = computed(() => (props.session.server !== null ? (store.characters[characterId(props.session.server, props.session.name)]?.className ?? null) : null))
const counts = computed(() => lootCounts(countedRuns(props.session)))
const deaths = computed(() => (props.session.runs ?? []).reduce((n, r) => n + (r.deaths ?? 0), 0))

/** Amounts by source's name (the zones of one name together), the biggest first. */
function ranked(by: Record<string, number> | undefined): [string, number][] {
  const named = new Map<string, number>()
  for (const [source, n] of Object.entries(by ?? {})) if (n > 0) named.set(sourceLabel(source), (named.get(sourceLabel(source)) ?? 0) + n)
  return [...named].sort((a, b) => b[1] - a[1])
}
const currencies = computed(() => Object.entries(props.session.currencies ?? {}).filter(([, n]) => n > 0))

/** The dungeons (field bosses apart), by zone and mode, the last run first, each's runs the latest first; the field bosses, the latest first. */
/** Kinds shown as one group whatever their dungeon (the Nightmares, whatever their boss and level; the arenas, Solo and Co-op), opened to each run. */
const TOGETHER: Record<string, string> = { nightmare: 'nightmare', bosschallenge: 'nightmare', arena: 'arena' }
const togetherAs = (g: DungeonRun[]): string | undefined => TOGETHER[g[0]!.kind]
/** A group of several dungeons (the Nightmares): its kind's name for title, each run's own in its line, closed until clicked. */
const mixed = (g: DungeonRun[]): boolean => togetherAs(g) !== undefined || g.some((r) => runName(r, t) !== runName(g[0]!, t))
const openGroups = ref(new Set<string>())
const groupKey = (g: DungeonRun[]): string => `${g[0]!.world}:${g[0]!.name}`
function toggleGroup(g: DungeonRun[]): void {
  const next = new Set(openGroups.value)
  if (next.has(groupKey(g))) next.delete(groupKey(g))
  else next.add(groupKey(g))
  openGroups.value = next
}
const groups = computed(() =>
  joinTogether(runGroups((props.session.runs ?? []).filter((r) => !runIsOneOff(r))))
    .map((g) => [...g].reverse())
    .sort((a, b) => b[0]!.start - a[0]!.start),
)
/** The groups of a kind shown together (TOGETHER) as one each, where the first of them was. */
function joinTogether(gs: DungeonRun[][]): DungeonRun[][] {
  const out: DungeonRun[][] = []
  const joined = new Map<string, DungeonRun[]>()
  for (const g of gs) {
    const as = togetherAs(g)
    if (!as) out.push(g)
    else if (joined.has(as)) joined.get(as)!.push(...g)
    else {
      const all = [...g]
      joined.set(as, all)
      out.push(all)
    }
  }
  for (const all of joined.values()) all.sort((a, b) => a.start - b.start)
  return out
}
const bosses = computed(() => (props.session.runs ?? []).filter((r) => r.kind === 'fieldboss').reverse())
const hiddenCubes = computed(() => (props.session.runs ?? []).filter((r) => r.kind === 'hiddencube').reverse())
/** A group's clears' mean time, or null. */
function meanClear(g: DungeonRun[]): string | null {
  const cleared = g.filter((r) => r.cleared !== undefined)
  return cleared.length ? mmss(cleared.reduce((n, r) => n + runMs(r), 0) / cleared.length) : null
}
/** Kina a run made: its own, else its cubes'. */
const kinaOf = (r: DungeonRun): number => Math.max(r.kina, r.loot?.['930100031'] ?? 0)

/** The gathering by resource (shared/sessions.ts). */
const resources = computed(() => gatheredByResource(props.session))
/** What the gatherings gave besides their resources, as a run's rewards. */
const finds = computed(() => runRewards({ world: 0, name: 'Gathering', kind: 'other', start: 0, end: 0, ap: 0, kina: 0, currencies: {}, loot: props.session.gatherFinds ?? {} }))
/** Each resource's gatherings and failures, when some have them (counted since 2026-11-23). */
const countsShown = computed(() => resources.value.some((r) => r.counts))
/** A resource's grades in their columns: plain (white), Fine (green), Pure (blue), Radiant (gold and above). */
function gradeSlots(r: GatheredResource): (GatheredResource['grades'][number] | null)[] {
  const slot = (grade: number): number => (grade >= 41 ? 3 : grade >= 31 ? 2 : grade >= 21 ? 1 : 0)
  const slots: (GatheredResource['grades'][number] | null)[] = [null, null, null, null]
  for (const g of r.grades) slots[slot(g.grade)] = g
  return slots
}
/** The crafts by recipe, the most made first: its name, icon, how many, how many procced, and the proc's item. */
const craftRows = computed(() => {
  const by = new Map<number, { made: number; procs: number; fails: number }>()
  for (const c of props.session.crafts ?? []) {
    const r = by.get(c.recipe) ?? { made: 0, procs: 0, fails: 0 }
    r.made++
    if (c.proc) r.procs++
    if (c.failed) r.fails++
    by.set(c.recipe, r)
  }
  return [...by]
    .map(([recipe, r]) => {
      const def = recipeOf(recipe)
      return {
        recipe,
        ...r,
        name: def?.[0][2] ?? `#${recipe}`,
        grade: def?.[0][3] ?? 11,
        icon: itemIcon(def?.[0][4]),
        procName: def?.[1] ? `${def[1][2]}${def[1][1] > 1 ? ` x${def[1][1]}` : ''}` : '',
        procIcon: itemIcon(def?.[1]?.[4]),
      }
    })
    .sort((a, b) => b.made - a.made)
})
const craftProcs = computed(() => (props.session.crafts ?? []).filter((c) => c.proc).length)

/** What a duty mission (or a supply request) gave, one by one: its name (without "(Bound)"), grade, icon and amount. */
function dutyRewards(d: DutyDone | SupplyDone): { id: string; name: string; grade: number; icon: string | null; amount: number }[] {
  return Object.entries(d.rewards).map(([id, amount]) => {
    const item = itemInfo(id)
    return { id, name: (item?.name ?? `#${id}`).replace(' (Bound)', ''), grade: item?.grade ?? 11, icon: itemIcon(item?.icon), amount }
  })
}

/** A duty mission's whole list, as shown: each reward's name, grade, icon, amount, chance and whether it came. */
function offerRows(d: DutyDone): { name: string; grade: number; icon: string | null; amount: number; chance: number; got: boolean }[] {
  return (d.offered ?? []).map((o) => {
    const item = itemInfo(o.item)
    return { name: (item?.name ?? `#${o.item}`).replace(' (Bound)', ''), grade: item?.grade ?? 11, icon: itemIcon(item?.icon), amount: o.amount, chance: o.chance, got: o.got }
  })
}
/** The duty missions whose whole list is shown, by when. */
const openDuties = ref(new Set<number>())
function toggleDuty(d: DutyDone): void {
  if (!d.offered?.length) return
  const next = new Set(openDuties.value)
  if (next.has(d.at)) next.delete(d.at)
  else next.add(d.at)
  openDuties.value = next
}

/** A Hidden Cube's line: its best few, the rest in its list. */
const CUBE_SHOWN = 3
/** The runs whose own loot is shown, by start. */
const open = ref(new Set<number>())
/** Over with nothing from it: not one still going (a Shugo game gives its rewards at its end). */
const abandoned = (r: DungeonRun): boolean => r.end !== null && !runCounts(r)
function toggle(r: DungeonRun): void {
  const next = new Set(open.value)
  if (next.has(r.start)) next.delete(r.start)
  else next.add(r.start)
  open.value = next
}
</script>

<template>
  <div class="space-y-4 text-sm">
    <!-- Who and when, and its totals. -->
    <div>
      <template v-if="header">
        <div class="flex items-center gap-2">
          <CharName :name="session.name" :class-name="className" :size="20" class="text-lg font-semibold" />
          <span v-if="live" class="rounded-full bg-green/15 px-2 py-0.5 text-xs font-medium text-green">{{ t('In progress') }}</span>
        </div>
        <div class="mt-0.5 text-xs text-darker first-letter:uppercase">{{ longDate(session.start) }} · {{ timeOfDay(session.start) }}–{{ timeOfDay(session.last) }} · {{ lasting(session.last - session.start) }}</div>
      </template>
      <div :class="['flex flex-wrap items-center gap-x-5 gap-y-1.5 tabular-nums', header && 'mt-3']">
        <span v-if="session.ap" class="flex items-center gap-1.5 font-semibold text-blue"><img :src="currencyIcon(AP_ITEM) ?? undefined" alt="" class="size-4" draggable="false" />{{ formatAmount(session.ap) }} AP</span>
        <span v-if="session.kina" class="flex items-center gap-1.5 font-semibold text-yellow"><img :src="currencyIcon(KINA_ITEM) ?? undefined" alt="" class="size-4" draggable="false" />{{ formatKina(session.kina) }}</span>
        <template v-for="k in LOOT_KINDS" :key="k.key">
          <span v-if="counts[k.key]" :class="['flex items-center gap-1.5 font-semibold', LOOT_KIND_STYLE[k.key]!.class]" :title="t(k.label)"><svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ counts[k.key] }} <span class="text-xs font-normal text-darker">{{ t(k.label) }}</span></span>
        </template>
        <span v-if="countedRuns(session).length" class="flex items-center gap-1.5 text-dark" :title="t('Dungeons, Shugo games and the like run')"><svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.dungeon" /></svg>{{ countedRuns(session).length }} <span class="text-xs font-normal text-darker">{{ t('Runs') }}</span></span>
        <span v-if="deaths" class="flex items-center gap-1.5 text-red" :title="t('Your deaths')"><svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.skull" /></svg>{{ deaths }}</span>
      </div>
      <div v-if="currencies.length" class="mt-1.5 flex flex-wrap items-center gap-4 text-xs">
        <span v-for="[id, n] in currencies" :key="id" class="flex items-center gap-1">
          <img v-if="currencyIcon(id)" :src="currencyIcon(id)!" alt="" class="size-4" draggable="false" />
          <svg v-else viewBox="0 0 16 16" class="size-3.5 text-green" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="CURRENCY_ICON[id] ?? ICON.stone" /></svg>
          {{ t(CURRENCY_LABELS[id] ?? id) }} <span class="font-semibold tabular-nums text-green">+{{ n.toLocaleString('en-US') }}</span>
        </span>
      </div>
    </div>

    <!-- Where its Abyss Points and Kina came from, side by side. -->
    <div v-if="ranked(session.sources).length || ranked(session.kinaSources).length" class="grid gap-3 sm:grid-cols-2">
      <div v-for="part in [{ by: session.sources, all: session.ap, label: 'Abyss Points by source', bar: 'bg-blue', fmt: formatAmount }, { by: session.kinaSources, all: session.kina, label: 'Kina by source', bar: 'bg-yellow', fmt: formatKina }].filter((p) => ranked(p.by).length)" :key="part.label" class="rounded-lg bg-card p-3 text-xs">
        <div class="mb-1.5 font-medium text-darker">{{ t(part.label) }}</div>
        <div v-for="[label, n] in ranked(part.by)" :key="label" class="flex items-center gap-2 py-0.5">
          <span class="min-w-0 flex-1 truncate">{{ t(label) }}</span>
          <span class="h-1 w-20 overflow-hidden rounded-full bg-dark"><span :class="['block h-full rounded-full', part.bar]" :style="{ width: `${(n / Math.max(1, part.all)) * 100}%` }" /></span>
          <span class="w-14 text-right tabular-nums">{{ part.fmt(n) }}</span>
        </div>
      </div>
    </div>

    <!-- Its dungeons: each zone and mode, what its runs gave in all, then each run. -->
    <div v-for="g in groups" :key="groupKey(g)" class="rounded-lg bg-card p-3">
      <div :class="['flex flex-wrap items-baseline gap-x-2 text-xs', mixed(g) && 'cursor-pointer']" @click="mixed(g) && toggleGroup(g)">
        <svg viewBox="0 0 16 16" class="size-3.5 shrink-0 self-center text-darker" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="kindIcon(g[0]!.kind)" /></svg>
        <span class="text-sm font-semibold">{{ mixed(g) ? t(runKindLabel(g[0]!.kind)) : runName(g[0]!, t) }}</span>
        <span v-if="g.length > 1" class="font-semibold text-accent">×{{ g.length }}</span>
        <span v-if="!mixed(g)" class="text-darker">{{ t(runKindLabel(g[0]!.kind)) }}</span>
        <svg v-if="mixed(g)" viewBox="0 0 16 16" :class="['ml-auto size-3 self-center text-darker transition-transform', openGroups.has(groupKey(g)) && 'rotate-90']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
        <span v-if="meanClear(g)" class="text-darker">· {{ t('mean clear {time}', { time: meanClear(g)! }) }}</span>
      </div>
      <!-- What they gave in all, in a row. -->
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
        <span v-for="r in runRewards(mergeRuns(g))" :key="r.id" class="flex items-center gap-1" :title="r.name">
          <img v-if="r.icon" :src="r.icon" alt="" class="size-4 rounded-sm" draggable="false" />
          <svg v-else viewBox="0 0 16 16" :class="['size-4', gradeClass(r.grade)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
          <span :class="r.currency ? 'text-default' : gradeClass(r.grade)">{{ r.currency ? (r.id === '930100031' ? formatKina(r.amount) : r.amount.toLocaleString('en-US')) : `×${r.amount}` }}</span>
        </span>
      </div>
      <!-- Each run (a group of several dungeons: once opened, each with its own name). -->
      <table v-if="!mixed(g) || openGroups.has(groupKey(g))" class="mt-2 w-full text-xs tabular-nums">
        <tbody>
          <template v-for="r in g" :key="r.start">
            <tr :class="['cursor-pointer border-t border-dark hover:bg-dark/50', abandoned(r) && 'text-darker line-through']" @click="toggle(r)">
              <td class="py-1 pl-1 text-dark">{{ timeOfDay(r.start) }}</td>
              <td v-if="mixed(g)" class="py-1 font-medium">{{ runName(r, t) }}</td>
              <td class="py-1">
                <span v-if="!runIsTimed(r)" class="text-darker">–</span>
                <span v-else-if="r.end === null && r.cleared === undefined" class="text-accent">{{ t('in progress') }}</span>
                <span v-else :class="r.cleared !== undefined ? 'text-green' : 'text-darker'">{{ mmss(runMs(r)) }}</span>
                <span v-if="abandoned(r)" class="ml-1 text-darker">{{ t('abandoned') }}</span>
              </td>
              <td class="py-1">
                <!-- An arena: your kills, deaths and assists. -->
                <span v-if="r.kda" class="font-semibold" :title="t('Kills / deaths / assists')"><span class="text-green">{{ r.kda.kills }}</span> / <span class="text-red">{{ r.kda.deaths }}</span> / <span class="text-blue">{{ r.kda.assists }}</span> <span class="font-normal text-darker">KDA</span></span>
                <template v-else-if="runBest(r)"><FightLink as="dps" :value="fightDps(runBest(r)!)" :fight="runBest(r)!.id" :title="t('Your DPS on {boss}', { boss: runBest(r)!.bossName })" /> DPS</template>
              </td>
              <td class="py-1" :title="t('Your deaths')">
                <span class="flex items-center gap-0.5"><svg viewBox="0 0 16 16" class="size-3 text-red" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.skull" /></svg><span :class="r.deaths ? 'font-semibold text-red' : 'text-darker'">{{ r.deaths ?? '-' }}</span></span>
              </td>
              <td class="py-1 text-yellow">{{ kinaOf(r) ? formatKina(kinaOf(r)) : '' }}</td>
              <td v-for="k in LOOT_KINDS" :key="k.key" class="py-1">
                <span v-if="lootCounts([r])[k.key]" :class="['flex items-center gap-0.5', LOOT_KIND_STYLE[k.key]!.class]" :title="t(k.label)"><svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ lootCounts([r])[k.key] }}</span>
              </td>
              <td class="w-4 py-1 pr-1 text-right">
                <svg v-if="r.loot" viewBox="0 0 16 16" :class="['ml-auto size-3 text-darker transition-transform', open.has(r.start) && 'rotate-90']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
              </td>
            </tr>
            <tr v-if="open.has(r.start)">
              <td colspan="10" class="pb-1.5"><RunLoot :run="r" /></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Its field bosses: each with what its chest gave. -->
    <div v-if="bosses.length" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.skull" /></svg>{{ t('Field bosses') }}
      </div>
      <div v-for="r in bosses" :key="r.start" class="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark py-1 first:border-t-0">
        <span class="font-semibold">{{ r.name }}</span>
        <span class="tabular-nums text-darker">{{ timeOfDay(r.start) }}</span>
        <span v-for="x in runRewards(r)" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.name">
          <img v-if="x.icon" :src="x.icon" alt="" class="size-4 rounded-sm" draggable="false" />
          <span :class="gradeClass(x.grade)">{{ x.name.replace(' (Bound)', '') }}</span> ×{{ x.amount }}
        </span>
      </div>
    </div>

    <!-- Its Hidden Cubes: each with what it gave. -->
    <div v-if="hiddenCubes.length" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M8 1.8l5.5 3.1v6.2L8 14.2l-5.5-3.1V4.9zM2.5 4.9L8 8l5.5-3.1M8 8v6.2" /></svg>{{ t('Hidden Cubes') }}
        <span class="font-semibold tabular-nums text-default">{{ hiddenCubes.length }}</span>
      </div>
      <!-- Each a line with its best few, opened to all it gave as a run's list. -->
      <template v-for="r in hiddenCubes" :key="r.start">
        <button type="button" class="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark py-1 text-left first:border-t-0 hover:bg-dark/50" @click="toggle(r)">
          <span class="tabular-nums text-darker">{{ timeOfDay(r.start) }}</span>
          <span v-if="!runRewards(r).length" class="text-darker">{{ t('Nothing worth keeping') }}</span>
          <span v-for="x in runRewards(r).slice(0, CUBE_SHOWN)" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.name">
            <img v-if="x.icon" :src="x.icon" alt="" class="size-4 rounded-sm" draggable="false" />
            <span :class="gradeClass(x.grade)">{{ x.name.replace(' (Bound)', '') }}</span> ×{{ x.amount }}
          </span>
          <span v-if="runRewards(r).length > CUBE_SHOWN" class="text-darker">{{ t('+{n} more', { n: runRewards(r).length - CUBE_SHOWN }) }}</span>
          <svg v-if="runRewards(r).length" viewBox="0 0 16 16" :class="['ml-auto size-3 text-darker transition-transform', open.has(r.start) && 'rotate-90']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
        </button>
        <RunLoot v-if="open.has(r.start)" :run="r" class="mb-1" />
      </template>
    </div>

    <!-- Its crafts, by recipe (the most made first): how many, how many procced, and what they made. -->
    <div v-if="session.crafts?.length" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2.5l4 4-6 6-4-4zM5.5 10.5l-3 3" /></svg>{{ t('Crafts') }}
        <span class="font-semibold tabular-nums text-default">{{ session.crafts.length }}</span>
        <span v-if="craftProcs" class="text-green">{{ t('{n} procs', { n: craftProcs }) }}</span>
      </div>
      <div v-for="c in craftRows" :key="c.recipe" class="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark py-1 first:border-t-0">
        <img v-if="c.icon" :src="c.icon" alt="" class="size-4 rounded-sm" draggable="false" />
        <span :class="['font-semibold', gradeClass(c.grade)]">{{ c.name }}</span>
        <span class="tabular-nums text-dark">×{{ c.made }}</span>
        <span v-if="c.procs" class="flex items-center gap-1 tabular-nums text-green" :title="c.procName">
          <img v-if="c.procIcon" :src="c.procIcon" alt="" class="size-4 rounded-sm" draggable="false" />{{ t('{n} procs', { n: c.procs }) }}
        </span>
        <span v-if="c.fails" class="tabular-nums text-red">{{ t('{n} failed', { n: c.fails }) }}</span>
      </div>
    </div>

    <!-- Its supply requests, the latest first: each with what it gave. -->
    <div v-if="session.supplies?.length" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.box" /></svg>{{ t('Supply requests') }}
        <span class="font-semibold tabular-nums text-default">{{ session.supplies.length }}</span>
      </div>
      <div v-for="d in [...session.supplies].reverse()" :key="d.at" class="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark py-1 first:border-t-0">
        <span class="tabular-nums text-darker">{{ timeOfDay(d.at) }}</span>
        <span class="font-semibold">{{ supplyName(d.request) }}</span>
        <span v-for="x in dutyRewards(d)" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.name">
          <img v-if="x.icon" :src="x.icon" alt="" class="size-4 rounded-sm" draggable="false" />
          <svg v-else viewBox="0 0 16 16" :class="['size-4', gradeClass(x.grade)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
          <span :class="gradeClass(x.grade)">{{ x.name }}</span> {{ x.amount >= 1000 ? x.amount.toLocaleString('en-US') : `×${x.amount}` }}
        </span>
      </div>
    </div>

    <!-- Its duty missions, the latest first: each with what it gave. -->
    <div v-if="session.duties?.length" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-1 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.scroll" /></svg>{{ t('Duty missions') }}
        <span class="font-semibold tabular-nums text-default">{{ session.duties.length }}</span>
      </div>
      <template v-for="d in [...session.duties].reverse()" :key="d.at">
        <button type="button" class="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark py-1 text-left first:border-t-0 hover:bg-dark/50" @click="toggleDuty(d)">
          <span class="tabular-nums text-darker">{{ timeOfDay(d.at) }}</span>
          <span class="font-semibold">{{ questName(d.quest) }}</span>
          <span v-for="x in dutyRewards(d)" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.name">
            <img v-if="x.icon" :src="x.icon" alt="" class="size-4 rounded-sm" draggable="false" />
            <svg v-else viewBox="0 0 16 16" :class="['size-4', gradeClass(x.grade)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
            <span :class="gradeClass(x.grade)">{{ x.name }}</span> {{ x.amount >= 1000 ? x.amount.toLocaleString('en-US') : `×${x.amount}` }}
          </span>
          <svg v-if="d.offered?.length" viewBox="0 0 16 16" :class="['ml-auto size-3 text-darker transition-transform', openDuties.has(d.at) && 'rotate-90']" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
        </button>
        <!-- Its whole list, the likeliest first: what came ticked in green, the rest dimmed. -->
        <div v-if="openDuties.has(d.at) && d.offered?.length" class="mb-1 ml-10 max-w-sm space-y-0.5 py-0.5">
          <div v-for="(o, i) in offerRows(d)" :key="i" :class="['flex items-center gap-1.5', !o.got && 'opacity-50']">
            <svg v-if="o.got" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-green" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7" /></svg>
            <span v-else class="size-3.5 shrink-0" />
            <img v-if="o.icon" :src="o.icon" alt="" class="size-4 shrink-0 rounded-sm" draggable="false" />
            <svg v-else viewBox="0 0 16 16" :class="['size-4 shrink-0', gradeClass(o.grade)]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path :d="ICON.box" /></svg>
            <span :class="['min-w-0 flex-1 truncate', gradeClass(o.grade)]">{{ o.name }}</span>
            <span class="tabular-nums">{{ o.amount >= 1000 ? o.amount.toLocaleString('en-US') : `×${o.amount}` }}</span>
            <span class="w-10 text-right tabular-nums text-darker">{{ o.chance >= 1 ? '100%' : `${Math.round(o.chance * 1000) / 10}%` }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Its gathering. -->
    <div v-if="session.gathering?.done" class="rounded-lg bg-card p-3 text-xs">
      <div class="mb-2 flex items-center gap-1.5 font-medium text-darker">
        <svg viewBox="0 0 16 16" class="size-3.5 text-green" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.leaf" /></svg>{{ t('Gathering') }}
      </div>
      <GatherStats :stats="session.gathering" class="mb-2" />
      <!-- By resource, a line each: what came in a column per grade (plain, Fine, Pure, Radiant; empty
           without), then its gatherings and failures when counted (since 2026-11-23). -->
      <div class="grid items-center justify-start gap-x-4 gap-y-1 tabular-nums" :style="{ gridTemplateColumns: `repeat(${countsShown ? 6 : 5}, auto)` }">
        <template v-for="r in resources" :key="r.item">
          <span class="flex items-center gap-1.5">
            <img v-if="r.icon" :src="r.icon" alt="" class="size-4 rounded-sm" draggable="false" />
            <span class="font-semibold">{{ r.name }}</span>
          </span>
          <span v-for="(g, i) in gradeSlots(r)" :key="i" :class="['flex items-center gap-1', g && gradeClass(g.grade)]" :title="g?.name">
            <template v-if="g">
              <img v-if="g.icon && g.item !== r.item" :src="g.icon" alt="" class="size-4 rounded-sm" draggable="false" />
              {{ g.item === r.item ? '' : g.name.replace(r.name, '').trim() || g.name }} ×{{ g.n }}
            </template>
            <!-- None plain: ×0, dimmed, so its line does not look empty. -->
            <span v-else-if="i === 0" class="text-darkest">×0</span>
          </span>
          <span v-if="countsShown" class="text-darker" :title="t('Gatherings')">
            <template v-if="r.counts">{{ t(r.counts.done === 1 ? '{n} gathering' : '{n} gatherings', { n: r.counts.done }) }}<span v-if="r.counts.failed" class="ml-1.5 text-red">✕{{ r.counts.failed }}</span></template>
            <!-- Gathered before each resource's gatherings were counted. -->
            <span v-else class="text-darkest" :title="t('Gathered before they were counted')">{{ t('? gatherings') }}</span>
          </span>
        </template>
      </div>
      <!-- What the gatherings gave besides their resources. -->
      <div v-if="finds.length" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-dark pt-1.5">
        <span class="text-darker">{{ t('Also found') }}</span>
        <span v-for="x in finds" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.name">
          <img v-if="x.icon" :src="x.icon" alt="" class="size-4 rounded-sm" draggable="false" />
          <span :class="gradeClass(x.grade)">{{ x.name.replace(' (Bound)', '') }}</span> ×{{ x.amount }}
        </span>
      </div>
    </div>

    <p v-if="!session.runs?.length && !session.duties?.length && !session.supplies?.length && !session.crafts?.length && !session.gathering?.done && !ranked(session.sources).length && !ranked(session.kinaSources).length" class="text-xs text-darker">{{ t('Nothing more in this session.') }}</p>
  </div>
</template>
