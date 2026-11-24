<script setup lang="ts">
// The Unified HUD: one small bar at the top of the game, in place of a screen full of widgets. At
// rest it is the logo, the next two events, your ping, the overlays' buttons, the speaker that mutes
// every sound and the cog that opens the app. Everything works by click, nothing by hover (the game
// gives the mouse only while Alt is held): a button or a chip opens its peek under the bar, a second
// click closes it, and the peek has the button that opens or closes the overlay itself. The rest shows up when it matters and
// goes by itself: what you are hitting, Kina and Abyss Points per hour while they come in (a rift's
// total during a Spacetime Rift), a Hidden Cube in view, enemies who can attack you, a field boss
// alive, and where you last died. Moved by dragging the bar; it grows around its top centre, sized to
// what it shows (main sizes the window to it).
import { useOverlay } from '@/lib/overlay.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import CubeIcon from '@/components/CubeIcon.vue'
import PetIcon from '@/components/PetIcon.vue'
import SkullMark from '@/components/SkullMark.vue'
import WorldMap from '@/components/WorldMap.vue'
import { bridge } from '@/lib/bridge.ts'
import { cubeBearings, meters } from '@/lib/cubes.ts'
import { useEnemyAlarm } from '@/lib/enemyAlarm.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { displayName } from '@/lib/petDb.ts'
import { currentWorld, nearbyPets, useSpawns } from '@/lib/spawns.ts'
import { CLOCK_ICON, EVENT_ICONS } from '@/lib/timerView.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { riftOf } from '@shared/abyss.ts'
import { characterId, CORRIDORS, corridorStates, counterNow, ENERGY, nextCorridorReset } from '@shared/characters.ts'
import type { HudWidget, KinaIcon } from '@shared/settings.ts'
import { formatAmount, livePerHour } from '@shared/earnings.ts'
import { formatKina } from '@shared/kina.ts'
import { CLASS_COLORS, meterRows, NO_METER, timeToKill, type MeterData, type NewBest } from '@shared/meter.ts'
import { serverTag } from '@shared/servers.ts'
import { bossPortrait, bossState, nextStart, TIMERS, type TimerDef } from '@shared/timers.ts'
import { blankPet, canAttack, nextLevelSouls, type Pet } from '@shared/tracker.ts'

/** What can be open under the bar: a peek at an overlay, or what a chip points at. */
type PanelId = 'meter' | 'map' | 'pvp' | 'pets' | 'applicants' | 'corridors' | 'timers' | 'cube' | 'death' | 'enemies'
type Peek = 'meter' | 'map' | 'pvp' | 'pets'

const store = useApp()
const api = bridge()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { root, report } = useOverlay('unified')
const cfg = computed(() => store.settings.unified)

const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 1000)

// ---- what is open under the bar: by click, closed by a second one ---------------------------------

const panel = ref<PanelId | null>(null)
const shown = computed<PanelId | null>(() => panel.value)
const show = (id: PanelId): void => void (panel.value = panel.value === id ? null : id)

// ---- the overlays' buttons ---------------------------------------------------------------------

const ICONS: Record<Peek, string> = {
  meter: 'M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5',
  map: 'M1.5 4l4.5-2 4 2 4.5-2v10l-4.5 2-4-2-4.5 2zM6 2v10M10 4v10',
  pvp: 'M3 13 13 3M9.5 3H13v3.5M3 3l4 4M13 13l-3-3',
  pets: 'M5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM13 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 9c-2 0-3.5 2-3.5 3.3 0 1 1 1.2 2.2 1.2.6 0 .9-.3 1.3-.3s.7.3 1.3.3c1.2 0 2.2-.2 2.2-1.2C11.5 11 10 9 8 9Z',
}
const PEEKS: { id: Peek; label: string }[] = [
  { id: 'meter', label: 'DPS meter' },
  { id: 'map', label: 'Map' },
  { id: 'pvp', label: 'Kill feed' },
  { id: 'pets', label: 'Pets and soul drops' },
]
/** The overlay itself is open over the game. */
const overlayOn = (id: Peek): boolean =>
  id === 'meter' ? store.settings.meter.enabled : id === 'map' ? store.settings.minimap.enabled : id === 'pvp' ? store.settings.killFeed.open : store.settings.hud.enabled
function toggleOverlay(id: Peek): void {
  const s = store.settings
  if (id === 'meter') void store.set('meter', { ...s.meter, enabled: !s.meter.enabled })
  else if (id === 'map') void store.set('minimap', { ...s.minimap, enabled: !s.minimap.enabled })
  else if (id === 'pvp') void api.invoke(s.killFeed.open ? 'killfeed:close' : 'killfeed:open')
  else void store.set('hud', { ...s.hud, enabled: !s.hud.enabled })
}
const peekTitle = (p: { id: Peek; label: string }): string => t('{name}: click to see it here', { name: t(p.label) })
const peekHint = computed(() => {
  const id = shown.value
  if (id !== 'meter' && id !== 'map' && id !== 'pvp' && id !== 'pets') return null
  return overlayOn(id) ? t('Close its overlay') : t('Open it as its own overlay')
})

const set = (patch: Partial<typeof cfg.value>): void => void store.set('unified', { ...cfg.value, ...patch })

// ---- the other overlays' buttons: a click turns the overlay on or off ----------------------------

const WIDGET_ICONS: Record<HudWidget, string> = {
  party: 'M2.5 3.5h11v3h-11zM2.5 9.5h11v3h-11zM4 5h5M4 11h3',
  buffs: 'M8 1.5 9.8 6l4.7.4-3.6 3 1.1 4.6L8 11.6 4 14l1.1-4.6-3.6-3L6.2 6z',
  cc: 'M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3M3.5 3.5l2 2M10.5 10.5l2 2M12.5 3.5l-2 2M5.5 10.5l-2 2',
  flight: 'M7.5 12C5.5 12 2.5 10.5 1 4.5c1.5 1 3 1.5 4.5 1.5C6.5 7 7 8 7.5 9.5ZM8.5 12c2 0 5-1.5 6.5-7.5-1.5 1-3 1.5-4.5 1.5C9.5 7 9 8 8.5 9.5Z',
  gather: 'M3 13c0-6 4-10 10-10 0 6-4 10-10 10ZM3 13l5-5',
  applicants: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M12 4.5v4M10 6.5h4',
  training: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 8h.01',
}
const WIDGET_LABELS: Record<HudWidget, string> = {
  party: 'Party frames', buffs: 'Buffs', cc: 'CC / Debuffs', flight: 'Flight timer', gather: 'Gathering outcome', applicants: 'Join requests', training: 'Training',
}
function widgetOn(w: HudWidget): boolean {
  const s = store.settings
  return w === 'cc' ? s.buffs.cc : w === 'training' ? s.dummy.overlay : s[w].enabled
}
function toggleWidget(w: HudWidget): void {
  const s = store.settings
  if (w === 'cc') void store.set('buffs', { ...s.buffs, cc: !s.buffs.cc })
  else if (w === 'training') void store.set('dummy', { ...s.dummy, overlay: !s.dummy.overlay })
  else void store.set(w, { ...s[w], enabled: !s[w].enabled } as never)
}

// ---- join requests, a personal best, the corridors -------------------------------------------------

const applicants = computed(() => (cfg.value.applicants ? store.applicants.list : []))
const dismiss = (character: number): void => void api.invoke('applicants:dismiss', character)
/** A personal best just beaten: on the bar this long. */
const BEST_MS = 10 * 60_000
const best = ref<(NewBest & { at: number }) | null>(null)
const bestShown = computed(() => (cfg.value.bests && best.value && now.value - best.value.at < BEST_MS ? best.value : null))
const openBest = (): void => void (bestShown.value && api.invoke('details:open', { kind: 'saved', id: bestShown.value.fight }))
/** Each character's corridors since the last reset; the one playing's to do bring the chip up. */
const corridorRows = computed(() =>
  Object.values(store.characters)
    .filter((c) => c.corridors)
    .map((c) => ({ c, states: corridorStates(c.corridors, now.value) }))
    .sort((a, b) => a.c.name.localeCompare(b.c.name)),
)
const corridorsToDo = computed(() => {
  const s = store.status
  if (!cfg.value.corridors || !s?.character || !s.server) return 0
  const mine = corridorRows.value.find((r) => r.c.server === s.server && r.c.name === s.character)
  return mine ? mine.states.filter((x) => x !== 'done').length : 0
})
const toggleMute = (): void => void store.set('muted', !store.settings.muted)
const openApp = (): void => void api.invoke('panel:open')
const openCharacters = (): void => void api.invoke('panel:characters')

// ---- the events: the next two, and the field bosses alive ----------------------------------------

/** Starts further away than this are left off the list (the timer bar's horizon). */
const HORIZON_MS = 13 * 3600_000
const timers = computed(() => store.settings.timers)
const alerting = computed(() => new Map(store.alerting.map((a) => [a.id, a.at])))
const isUp = (def: TimerDef): boolean =>
  def.schedule.kind === 'boss' && !!bossState(def.schedule.boss, store.fieldBosses, now.value, timers.value.region)?.up
/** The timers with their alert on: a boss that is up as Alive, the rest by their next start. */
const timerItems = computed(() =>
  TIMERS.filter((def) => timers.value.enabled[def.id] && timers.value.shown[def.id])
    .map((def) => {
      const up = !alerting.value.has(def.id) && isUp(def)
      return { def, up, at: up ? Number.NEGATIVE_INFINITY : (alerting.value.get(def.id) ?? nextStart(def.schedule, now.value, timers.value.region, store.fieldBosses)) }
    })
    .filter(({ at, up }) => up || (Number.isFinite(at) && at - now.value <= HORIZON_MS))
    .sort((a, b) => a.at - b.at),
)
const aliveBosses = computed(() => (cfg.value.bosses ? timerItems.value.filter((i) => i.up).slice(0, 3) : []))
const upcoming = computed(() => (cfg.value.events ? timerItems.value.filter((i) => !i.up).slice(0, 2) : []))
const portrait = (def: TimerDef): string | null => (def.schedule.kind === 'boss' ? bossPortrait(def.schedule.boss) : null)
const eventIcon = (def: TimerDef): string => EVENT_ICONS[def.id] ?? CLOCK_ICON
/** How near: far (grey), within half an hour (yellow), counting down (orange), started (green). */
function stage(at: number): 'far' | 'near' | 'soon' | 'now' {
  const min = (at - now.value) / 60_000
  return min <= 0 ? 'now' : min <= cfg.value.countdownMinutes ? 'soon' : min <= 30 ? 'near' : 'far'
}
const STAGE_TEXT = { far: 'text-darker', near: 'text-yellow', soon: 'text-orange', now: 'text-green' }
/** 48:09, 1:48:09; "now" once it has started. */
function countdown(at: number): string {
  const s = Math.ceil((at - now.value) / 1000)
  if (s <= 0) return t('now')
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
const startsAt = (at: number): string => new Date(at).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

// ---- Kina and Abyss Points, to the left while they come in --------------------------------------

/** The Kina icon picked: the game's coins are bundled (items/loot). */
const KINA_IMG: Record<KinaIcon, string | null> = {
  game: 'items/loot/Icon_Currency_Coin_GoldNonbinding.webp',
  bound: 'items/loot/Icon_Currency_Coin_GoldBinding.webp',
  gold: 'items/loot/Icon_Currency_Coin_gold.webp',
  drawn: null,
  word: null,
}
// Farming only (rewards are taken off: main/sessions.ts), and shown all the time while on, 0 too.
const kinaText = computed(() => (cfg.value.kina ? formatKina(store.kinaRate ?? 0) : null))
/** Abyss Points per hour at the pace of the last 15 seconds (0 between pulls). */
const abyssText = computed(() => (cfg.value.abyssRate ? formatAmount(livePerHour(store.abyss, now.value)) : null))
/** The Kina of the session going on: the character playing's, since their login. */
const sessionKina = computed(() => {
  const s = store.sessions.current
  return cfg.value.kinaSession && s && s.name === store.status?.character ? s.kina : null
})
/** The Abyss Points of the session going on: the character playing's, since their login. */
const season = computed(() => {
  const s = store.sessions.current
  return cfg.value.season && s && s.name === store.status?.character ? { points: s.ap } : null
})
/** The Spacetime Rift going on, once it is a farm (shared/abyss.ts): its total, beside the hourly rate. */
const rift = computed(() => {
  if (!cfg.value.rift) return null
  const start = riftOf(now.value, store.settings.timers.region)
  if (start === null) return null
  const mine = store.rifts.filter((r) => r.start === start)
  return mine.find((r) => r.name === store.status?.character) ?? mine[0] ?? null
})

// ---- what you are hitting ------------------------------------------------------------------------

const meter = ref<MeterData>(NO_METER)
const me = computed(() => meter.value.rows.find((r) => r.you) ?? null)
/** When your damage on the meter's target last went up. */
const hitAt = ref(0)
let meterLoaded = false
watch(
  () => [meter.value.target?.id ?? null, me.value?.damage ?? 0] as const,
  ([id, damage], [oldId, oldDamage]) => {
    if (meterLoaded && damage > 0 && (id !== oldId || damage > oldDamage)) hitAt.value = Date.now()
  },
)
const targetMs = computed(() => cfg.value.targetSeconds * 1000)
const fighting = computed(() => cfg.value.target && !!meter.value.target && !!me.value && now.value - hitAt.value < targetMs.value)
/** A selected player stays up this long (the game says nothing when you let go: a selection of anything else clears it). */
const SELECTED_MS = 30_000
/** The player you selected, as soon as you do (what is known of them: an unknown value is left out), or are hitting. */
const sheet = computed(() => {
  const tp = store.target
  if (!cfg.value.target || !tp) return null
  if (fighting.value && meter.value.target!.name !== tp.name) return null
  return now.value - tp.at < Math.max(SELECTED_MS, targetMs.value) ? tp : null
})
const targetOn = computed(() => fighting.value || !!sheet.value)
const hpShare = computed(() => {
  const tg = meter.value.target
  return fighting.value && tg && tg.maxHp > 0 && tg.hp !== null ? Math.min(1, Math.max(0, tg.hp / tg.maxHp)) : null
})
const ttk = computed(() => (fighting.value ? timeToKill(meter.value) : null))
/** 1234 → 1.2K, 1234567 → 1.23M */
function short(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return Math.round(n).toLocaleString('en-US')
}
const clock = (ms: number): string => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
/** A click on it opens the DPS meter, when that is closed. */
function targetClick(): void {
  if (!store.settings.meter.enabled) toggleOverlay('meter')
}
const meterTop = computed(() => meterRows(meter.value, store.settings.meter.players, 'damage').slice(0, 5))
const meterMax = computed(() => Math.max(1, ...meterTop.value.map((r) => r.value)))

// ---- chips: a cube, enemies, your last death, a boss run -----------------------------------------

const spawns = useSpawns()
const lastWorld = ref<number | null>(null)
const worldId = computed(() => (spawns.value ? (currentWorld(store.nearby, spawns.value) ?? lastWorld.value) : null))
watch(worldId, (id) => id !== null && (lastWorld.value = id))
const world = computed(() => (spawns.value && worldId.value !== null ? (spawns.value.worlds[worldId.value] ?? null) : null))
const inAbyss = computed(() => world.value?.group === 'abyss')

const cube = computed(() => (cfg.value.cubes ? (cubeBearings(store.cubes, store.nearby.position)[0] ?? null) : null))
const cubePins = computed(() => store.cubes.map((c) => c.position))

/** The enemies who can attack you: their PvP on, or anyone in the Abyss. */
const threats = computed(() => (cfg.value.enemies ? store.enemies.filter((e) => canAttack(e, inAbyss.value)) : []))
const ENEMY_ROWS = 8
const cp = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v))
// The alarm is Enemies nearby's: sounded from here whenever that overlay is not up (turned off, or
// kept closed while this replaces it), so it always sounds once, from one of the two.
useEnemyAlarm(() => !store.settings.enemies.enabled || cfg.value.replace)

const death = computed(() => {
  const d = cfg.value.death ? store.pvpStats.death : null
  return d && now.value - d.at < cfg.value.deathMinutes * 60_000 ? d : null
})
const deathWorld = computed(() => (death.value && spawns.value ? (spawns.value.worlds[death.value.place.world] ?? null) : null))
const deathFocus = computed<[number, number][]>(() => (death.value ? [death.value.place.position] : []))
const ago = (at: number): string => {
  const m = Math.max(0, Math.round((now.value - at) / 60_000))
  return m < 1 ? t('just now') : m < 60 ? t('{n} min ago', { n: m }) : t('{n} h ago', { n: Math.round(m / 60) })
}

// ---- peeks: the map, PvP, pets ---------------------------------------------------------------------

const NO_FOCUS: [number, number][] = []
const NO_LAYERS: never[] = []
const enemyPins = computed(() =>
  store.enemies.flatMap((e) => (e.position ? [{ name: e.name, position: e.position, threat: canAttack(e, inAbyss.value) }] : [])),
)
const deathHere = computed(() => {
  const d = store.pvpStats.death
  return d && d.place.world === worldId.value ? d.place.position : null
})

const pvpCounts = computed(() => store.pvpStats)
const lastKills = computed(() => [...store.pvpStats.recent].reverse())
const lastRift = computed(() => store.rifts[0] ?? null)
const day = (ms: number): string => new Date(ms).toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' })

const nearPets = computed<{ pet: Pet; count: number }[]>(() => {
  if (!spawns.value) return []
  const known = new Map(store.pets.map((p) => [p.id, p]))
  return nearbyPets(store.nearby, spawns.value)
    .filter((n) => !store.hiddenPet(n.pet))
    .slice(0, 5)
    .map((n) => ({ pet: known.get(n.pet) ?? blankPet(n.pet), count: n.count }))
})
const progress = (pet: Pet): string => {
  const need = nextLevelSouls(pet)
  return need === null ? 'max' : `${pet.souls}/${need}`
}

// ---- the rest of the bar ---------------------------------------------------------------------------

const ping = computed(() => (cfg.value.ping ? meter.value.ping : null))
const pingDot = computed(() => {
  const ms = ping.value
  return ms === null ? '' : ms < 80 ? 'bg-green' : ms < 150 ? 'bg-yellow' : 'bg-danger'
})
const localTime = computed(() => new Date(now.value).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }))
/** The Odyle energy of the character playing, worked out from its last login. */
const odyle = computed(() => {
  const s = store.status
  if (!cfg.value.odyle || !s?.character || !s.server) return null
  const c = counterNow(ENERGY, store.characters[characterId(s.server, s.character)]?.counters ?? null, now.value)
  return c ? c.now + c.extra : null
})
const drag = windowDrag({ overlay: 'unified' })

/** Tell main how big the window is: it grows and shrinks around its top centre. */
// Measured after each change too, not only by the observer: a hidden window (Alt+Shift+E, an
// alt-tab) does not run it, and would come back at its old size.
watch([shown, targetOn, () => cfg.value.targetStyle, kinaText, sessionKina, abyssText, season, rift, cube, death, () => applicants.value.length, bestShown, corridorsToDo, () => threats.value.length, () => aliveBosses.value.length, () => upcoming.value.length, () => cfg.value.scale], () => void nextTick(report))

const offs: (() => void)[] = []
onMounted(async () => {
  report()
  offs.push(api.on('meter:dps', (m) => (meter.value = m)))
  offs.push(api.on('meter:personalBest', (b) => (best.value = { ...b, at: Date.now() })))
  meter.value = await api.invoke('meter:get')
  void nextTick(() => (meterLoaded = true))
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  for (const off of offs) off()
})
</script>

<template>
  <!-- No shadow: the window is only as big as the bar plus a thin margin, so a soft shadow was cut
       off square at the window's edge instead of fading into the game. -->
  <div class="inline-block w-max">
    <div ref="root" class="inline-block w-max">
      <div
        :class="['mx-1.5 mb-1.5 mt-0 flex w-max flex-col overflow-hidden rounded-[14px] border text-default', 'min-w-[440px]']"
        :style="{ ...panelStyle(cfg.opacity), boxShadow: 'none', textShadow: cfg.opacity < 0.6 ? '0 1px 3px rgb(0 0 0 / 0.9), 0 0 2px rgb(0 0 0 / 0.8)' : 'none', zoom: cfg.scale }"
      >
        <!-- The bar. -->
        <div class="flex h-9 cursor-move items-center gap-2.5 whitespace-nowrap px-2.5" :title="t('Drag to move')" @pointerdown="drag.onPointerDown">
          <!-- Kina, then Abyss Points: each its icon, the session's total, and the farming's per hour. -->
          <template v-if="kinaText || sessionKina !== null || abyssText || rift || season">
            <span v-if="kinaText || sessionKina !== null" class="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-yellow">
              <img v-if="KINA_IMG[cfg.kinaIcon]" :src="KINA_IMG[cfg.kinaIcon]!" alt="Kina" class="size-4" draggable="false" />
              <svg v-else-if="cfg.kinaIcon === 'drawn'" viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M6 6.2c.3-.7 1-1 2-1s1.9.5 1.9 1.3c0 1.8-3.8 1-3.8 2.9 0 .8.8 1.3 1.9 1.3s1.7-.3 2-1" stroke-linecap="round" /></svg>
              <span v-else class="font-medium text-darker">Kina</span>
              <span v-if="sessionKina !== null" :title="t('Kina earned since you logged in with this character (by source on the Session page)')">{{ formatKina(sessionKina) }}</span>
              <span v-if="kinaText" class="font-medium" :title="t('Your farming\'s Kina per hour (rewards left out)')">{{ kinaText }}<span class="text-darker">/h</span></span>
            </span>
            <span v-if="abyssText || season" class="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-blue">
              <img v-if="cfg.apIcon === 'icon'" :src="'items/abyss-point.webp'" alt="AP" class="size-4" draggable="false" />
              <span v-else class="font-medium text-darker">AP</span>
              <span v-if="season" :title="t('Abyss Points earned since you logged in with this character (by source on the Session page)')">{{ formatAmount(season.points) }}</span>
              <span v-if="abyssText" class="font-medium" :title="t('Your farming\'s Abyss Points per hour, at your pace of the last 15 seconds (rewards left out)')">{{ abyssText }}<span class="text-darker">/h</span></span>
            </span>
            <span v-if="rift" class="flex items-center gap-1 text-xs font-semibold tabular-nums text-blue" :title="t('Abyss Points earned in this Spacetime Rift')">
              <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="EVENT_ICONS.rift" /></svg>
              <span class="font-medium text-darker">{{ t('Rift') }} {{ startsAt(rift.start) }}</span>
              +{{ formatAmount(rift.points) }}
            </span>
            <span class="h-4 w-px bg-light" />
          </template>

          <img v-if="cfg.logo" src="/icon.png" alt="Nayel Overlay" class="size-[18px] shrink-0" draggable="false" />

          <span v-if="cfg.clock" class="text-xs font-medium tabular-nums text-dark" :title="t('Local time')">{{ localTime }}</span>
          <button
            v-if="odyle !== null"
            type="button"
            class="flex items-center gap-1 rounded-md text-xs font-medium tabular-nums text-dark hover:text-default"
            :title="t('Odyle Energy: click for your characters\' energy, entries and Kina')"
            @pointerdown.stop
            @click="openCharacters"
          >
            <img :src="'items/odyle-energy.webp'" alt="" class="size-4" draggable="false" />{{ odyle }}
          </button>

          <!-- The next two events: tinted as they near, a countdown in the last minutes. -->
          <button
            v-if="upcoming.length"
            type="button"
            class="flex items-center gap-2.5"
            :aria-label="t('Next events')"
            @pointerdown.stop
            @click="show('timers')"
          >
            <span v-for="{ def, at } in upcoming" :key="def.id" :class="['flex items-center gap-1 transition-colors', STAGE_TEXT[stage(at)]]">
              <img v-if="portrait(def)" :src="portrait(def)!" alt="" draggable="false" :class="['size-4 rounded-sm object-cover', stage(at) === 'far' && 'opacity-60 grayscale']" />
              <svg v-else viewBox="0 0 16 16" class="size-[15px]" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="eventIcon(def)" /></svg>
              <span v-if="stage(at) === 'soon' || stage(at) === 'now'" class="text-xs font-semibold tabular-nums">{{ countdown(at) }}</span>
            </span>
          </button>

          <!-- A field boss alive: its portrait, until it dies. -->
          <button
            v-for="{ def } in aliveBosses"
            :key="def.id"
            type="button"
            class="flex h-6 items-center gap-1 rounded-full bg-green/15 pl-0.5 pr-2 text-xs font-semibold text-green"
            :title="`${t(def.name)}: ${t('Alive')}`"
            @pointerdown.stop
            @click="show('timers')"
          >
            <img v-if="portrait(def)" :src="portrait(def)!" alt="" draggable="false" class="size-[18px] rounded-full border-[1.5px] border-green object-cover" />
            {{ t('Alive') }}
          </button>

          <!-- Enemies who can attack you. -->
          <button
            v-if="threats.length"
            type="button"
            class="flex h-6 items-center gap-1 rounded-lg border border-red/50 bg-red/15 px-1.5 text-xs font-bold tabular-nums text-red"
            :aria-label="plural(threats.length, '{n} enemy who can attack you in view', '{n} enemies who can attack you in view')"
            @pointerdown.stop
            @click="show('enemies')"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4" />
            </svg>
            {{ threats.length }}
          </button>

          <!-- A Hidden Cube in view. -->
          <button
            v-if="cube"
            type="button"
            class="flex h-6 items-center gap-1.5 rounded-lg border border-yellow/40 bg-yellow/10 px-2 text-xs font-semibold text-yellow"
            @pointerdown.stop
            @click="show('cube')"
          >
            <CubeIcon :size="14" />
            {{ t('Hidden Cube') }}
            <template v-if="cube.distance !== null"> · {{ meters(cube.distance) }} {{ cube.direction }}</template>
          </button>

          <!-- Your last death. -->
          <button
            v-if="death"
            type="button"
            class="flex h-6 w-[26px] items-center justify-center rounded-lg border border-red/50 bg-red/15"
            :aria-label="t('Your last death: show where')"
            @pointerdown.stop
            @click="show('death')"
          >
            <SkullMark :size="16" />
          </button>

          <!-- Join requests to your party. -->
          <button
            v-if="applicants.length"
            type="button"
            class="flex h-6 items-center gap-1 rounded-lg border border-accent/50 bg-accent/15 px-1.5 text-xs font-bold tabular-nums text-accent"
            :aria-label="t('Join requests')"
            @pointerdown.stop
            @click="show('applicants')"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="WIDGET_ICONS.applicants" /></svg>
            {{ applicants.length }}
          </button>

          <!-- A personal best just beaten: its fight. -->
          <button
            v-if="bestShown"
            type="button"
            class="flex h-6 items-center gap-1 rounded-lg border border-yellow/50 bg-yellow/15 px-1.5 text-xs font-semibold tabular-nums text-yellow"
            :title="t('New personal best') + ` · ${bestShown.character} · ${bestShown.boss}`"
            @pointerdown.stop
            @click="openBest"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2.5h6v3a3 3 0 0 1-6 0zM5 3.5H3v1a2 2 0 0 0 2 2M11 3.5h2v1a2 2 0 0 1-2 2M8 8.5v3M5.5 13.5h5" /></svg>
            {{ short(bestShown.dps) }}
          </button>

          <!-- The corridors the character playing still has to do. -->
          <button
            v-if="corridorsToDo"
            type="button"
            class="flex h-6 items-center gap-1 rounded-lg border border-orange/50 bg-orange/15 px-1.5 text-xs font-semibold tabular-nums text-orange"
            :aria-label="t('Corridors')"
            :title="t('Corridors')"
            @pointerdown.stop
            @click="show('corridors')"
          >
            <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5V6a5.5 5.5 0 0 1 11 0v7.5M5.5 13.5V7.5a2.5 2.5 0 0 1 5 0v6" /></svg>
            {{ corridorsToDo }}
          </button>

          <!-- The overlays' buttons, the speaker and the cog. -->
          <template>
            <span class="unfold h-4 w-px bg-light" />
            <div class="unfold flex items-center gap-0.5">
              <button
                v-for="p in PEEKS"
                :key="p.id"
                type="button"
                :class="['relative flex h-7 w-[30px] items-center justify-center rounded-lg transition-colors hover:text-default', overlayOn(p.id) ? 'bg-accent/15 text-accent' : 'text-darker', shown === p.id && 'ring-1 ring-light']"
                :aria-label="t(p.label)"
                :title="peekTitle(p)"
                @pointerdown.stop
                @click="show(p.id)"
              >
                <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="ICONS[p.id]" /></svg>
                <span v-if="overlayOn(p.id)" class="absolute bottom-0.5 left-[11px] h-0.5 w-2 rounded-full bg-accent" />
              </button>
              <button
                v-for="w in cfg.widgets"
                :key="w"
                type="button"
                :class="['relative flex h-7 w-[30px] items-center justify-center rounded-lg transition-colors hover:text-default', widgetOn(w) ? 'bg-accent/15 text-accent' : 'text-darker']"
                :aria-label="t(WIDGET_LABELS[w])"
                :title="widgetOn(w) ? t('{name}: click to close its overlay', { name: t(WIDGET_LABELS[w]) }) : t('{name}: click to open its overlay', { name: t(WIDGET_LABELS[w]) })"
                @pointerdown.stop
                @click="toggleWidget(w)"
              >
                <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="WIDGET_ICONS[w]" /></svg>
                <span v-if="widgetOn(w)" class="absolute bottom-0.5 left-[11px] h-0.5 w-2 rounded-full bg-accent" />
              </button>
            </div>
            <span class="h-4 w-px bg-light" />
            <div class="unfold flex items-center gap-0.5">
              <button
                type="button"
                :class="['flex h-7 w-[30px] items-center justify-center rounded-lg transition-colors hover:bg-light', store.settings.muted ? 'text-red' : 'text-darker hover:text-default']"
                :aria-label="store.settings.muted ? t('Sounds are muted: turn them on') : t('Mute every sound')"
                :title="store.settings.muted ? t('Sounds are muted: turn them on') : t('Mute every sound')"
                @pointerdown.stop
                @click="toggleMute"
              >
                <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="store.settings.muted ? 'M2.5 6v4h2.5l3.5 3V3L5 6zM11 6l3.5 4M14.5 6 11 10' : 'M2.5 6v4h2.5l3.5 3V3L5 6zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9'" />
                </svg>
              </button>
              <button
                type="button"
                class="flex h-7 w-[30px] items-center justify-center rounded-lg text-darker transition-colors hover:bg-light hover:text-default"
                :aria-label="t('Open the app')"
                :title="t('Open the app')"
                @pointerdown.stop
                @click="openApp"
              >
                <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round">
                  <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13 8a5 5 0 0 0-.1-.9l1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.5-.9L9.4 1.5H6.6l-.3 1.8a5 5 0 0 0-1.5.9l-1.7-.6-1.4 2.4 1.4 1.1a5 5 0 0 0 0 1.8l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 0 0 1.5.9l.3 1.8h2.8l.3-1.8a5 5 0 0 0 1.5-.9l1.7.6 1.4-2.4-1.4-1.1c.1-.3.1-.6.1-.9Z" />
                </svg>
              </button>
            </div>
          </template>

          <!-- Your target, inline: one short segment, so nothing under the bar is covered. -->
                    <button
                      v-if="targetOn && cfg.targetStyle === 'inline'"
                      type="button"
                      class="unfold flex h-6 items-center gap-1.5 rounded-lg px-1.5 text-xs"
                      :title="store.settings.meter.enabled ? '' : t('Click to open the DPS meter')"
                      @click="targetClick"
                      @pointerdown.stop
                    >
                      <span class="h-4 w-px bg-light" />
                      <ClassIcon v-if="sheet" :class-name="sheet.className" :size="16" />
                      <span :class="['max-w-[140px] truncate font-semibold', sheet?.enemy && 'text-red']">{{ sheet?.name ?? meter.target?.name }}</span>
                      <span v-if="sheet?.combatPower" class="font-semibold tabular-nums text-yellow">{{ cp(sheet.combatPower) }}<span class="font-medium text-darker"> CP</span></span>
                      <span v-else-if="sheet?.className" class="text-darker">{{ t(sheet.className) }}</span>
                      <template v-if="fighting && me">
                        <span v-if="hpShare !== null" class="font-semibold tabular-nums text-red">{{ Math.round(hpShare * 100) }}%</span>
                        <span class="font-semibold tabular-nums">{{ short(me.dps) }}<span class="font-medium text-darker"> DPS</span></span>
                      </template>
                    </button>

          <span v-if="ping !== null" class="flex items-center gap-1.5 text-xs font-medium tabular-nums text-dark" :title="t('Your ping to the game server')">
            <span :class="['size-1.5 rounded-full', pingDot]" />{{ ping }} ms
          </span>
        </div>
        <div v-if="targetOn && cfg.targetStyle === 'inline' && hpShare !== null" class="h-0.5 bg-light">
          <div class="h-0.5 bg-danger transition-[width] duration-500 ease-linear" :style="{ width: `${hpShare * 100}%` }" />
        </div>

        <!-- What you are hitting: two short lines and a health line. -->
        <button
          v-if="targetOn && cfg.targetStyle === 'strip'"
          type="button"
          class="block min-w-[380px] whitespace-nowrap border-t border-card text-left"
          :title="store.settings.meter.enabled ? '' : t('Click to open the DPS meter')"
          @click="targetClick"
        >
          <div class="flex items-center gap-2 px-3 pb-1 pt-[5px]">
            <ClassIcon v-if="sheet" :class-name="sheet.className" :size="22" />
            <div class="min-w-0 flex-1">
              <div class="flex items-baseline gap-1.5 text-[13px] font-semibold leading-4">
                {{ sheet?.name ?? meter.target?.name }}
                <span v-if="sheet" :class="['text-[11px] font-medium tabular-nums', sheet.enemy ? 'text-red' : 'text-darker']"><template v-if="sheet.server">[{{ serverTag(sheet.server) }}]</template></span>
              </div>
              <div class="text-[11px] leading-[14px] text-darker">
                <template v-if="sheet">
                  {{ [sheet.className ? t(sheet.className) : null, sheet.legion].filter(Boolean).join(' · ') }}
                  <template v-if="sheet.combatPower"> · <span class="font-semibold text-yellow">{{ cp(sheet.combatPower) }}</span> CP</template>
                  <template v-if="sheet.gearScore"> · <span class="font-semibold text-dark">{{ sheet.gearScore.toLocaleString('en-US') }}</span> GS</template>
                  <template v-if="sheet.level"> · Lv{{ sheet.level }}</template>
                  <template v-if="sheet.pvp"> · <span class="font-semibold text-red">PvP</span></template>
                </template>
                <template v-else>{{ meter.target?.boss ? t('Boss') : t('Monster') }}{{ world ? ` · ${world.name}` : '' }}</template>
              </div>
            </div>
            <div v-if="fighting && me" class="text-right tabular-nums">
              <div class="text-[13px] font-bold leading-4">
                <template v-if="hpShare !== null"><span class="text-red">{{ Math.round(hpShare * 100) }}%</span> <span class="font-normal text-darkest">·</span> </template>
                {{ short(me.dps) }} <span class="text-[11px] font-medium text-darker">DPS</span>
              </div>
              <div class="text-[11px] leading-[14px] text-darker">
                {{ short(me.damage) }} · {{ clock(meter.battleTime) }}<template v-if="ttk !== null"> · {{ t('{time} to kill', { time: clock(ttk) }) }}</template>
              </div>
            </div>
          </div>
          <div v-if="hpShare !== null" class="h-[3px] bg-light">
            <div class="h-[3px] bg-danger transition-[width] duration-500 ease-linear" :style="{ width: `${hpShare * 100}%` }" />
          </div>
        </button>

        <!-- Under the bar: a peek at an overlay, or what a chip points at. -->
        <!-- w-0 min-w-full: it fills the bar but never widens it, so opening or changing a peek does not move the buttons under the mouse. -->
        <div v-if="shown" class="unfold w-0 min-w-full border-t border-card px-3.5 py-2.5">
          <!-- Join requests: each who asks, with an X to take them off. -->
          <div v-if="shown === 'applicants'" class="min-w-[320px]">
            <div class="text-[13px] font-semibold">{{ t('Join requests') }}</div>
            <div class="mt-1.5 space-y-0.5">
              <div v-for="a in applicants" :key="a.character" class="flex items-center gap-1.5 whitespace-nowrap text-[13px]">
                <ClassIcon :class-name="a.className" :size="16" />
                <span class="max-w-[150px] truncate font-medium">{{ a.name }}</span>
                <span v-if="a.server" class="text-[11px] tabular-nums text-darker">[{{ serverTag(a.server) }}]</span>
                <span v-if="a.combatPower" class="text-[11px] font-semibold tabular-nums text-yellow">{{ a.combatPower.toLocaleString('en-US') }}</span>
                <span v-if="a.gearScore" class="text-[11px] tabular-nums text-dark">ilvl {{ a.gearScore }}</span>
                <button type="button" class="ml-auto flex size-5 items-center justify-center rounded text-darker hover:bg-light hover:text-default" :title="t('Remove from the list')" @pointerdown.stop @click="dismiss(a.character)">
                  <svg viewBox="0 0 16 16" class="size-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Each character's corridors since the last reset. -->
          <div v-else-if="shown === 'corridors'" class="min-w-[300px]">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold">{{ t('Corridors') }}</span>
              <span class="text-[11px] text-darker">{{ t('Back {when}', { when: new Date(nextCorridorReset(now)).toLocaleString(loc(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }) }}</span>
            </div>
            <div class="mt-1.5 space-y-1">
              <div v-for="r in corridorRows" :key="r.c.name + r.c.server" class="flex items-center gap-2 whitespace-nowrap text-xs">
                <ClassIcon :class-name="r.c.className" :size="14" />
                <span class="w-24 truncate font-medium">{{ r.c.name }}</span>
                <span
                  v-for="(st, i) in r.states"
                  :key="i"
                  :class="['size-2.5 rounded-full', st === 'done' ? 'bg-light' : st === 'open' ? 'bg-orange' : 'border border-orange']"
                  :title="`${CORRIDORS[i]!.name}: ${st === 'done' ? t('done') : st === 'open' ? t('still to do') : t('not seen since the reset (likely still to do: enter the Abyss to check)')}`"
                />
              </div>
            </div>
          </div>

          <!-- The timers with their alert on, as the timer bar listed them. -->
          <div v-else-if="shown === 'timers'" class="min-w-[260px]">
            <div class="text-[13px] font-semibold">{{ t('Next events') }}</div>
            <div class="mt-1.5 space-y-1">
              <div v-for="{ def, at, up } in timerItems" :key="def.id" class="flex items-center gap-2 whitespace-nowrap text-xs">
                <img v-if="portrait(def)" :src="portrait(def)!" alt="" draggable="false" class="size-4 shrink-0 rounded-sm object-cover" />
                <svg v-else viewBox="0 0 16 16" class="size-4 shrink-0 text-darker" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path :d="eventIcon(def)" /></svg>
                <span class="font-medium">{{ t(def.name) }}</span>
                <span v-if="!up" class="tabular-nums text-darker">{{ startsAt(at) }}</span>
                <span v-if="up" class="ml-auto pl-4 font-semibold text-green">{{ t('Alive') }}</span>
                <span v-else :class="['ml-auto pl-4 font-semibold tabular-nums', stage(at) === 'far' ? 'text-default' : STAGE_TEXT[stage(at)]]">{{ countdown(at) }}</span>
              </div>
            </div>
          </div>

          <!-- Enemies nearby. -->
          <div v-else-if="shown === 'enemies'" class="min-w-[320px]">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold">{{ t('Enemies nearby') }}</span>
              <span class="text-[11px] text-red">{{ plural(threats.length, '{n} can attack you', '{n} can attack you') }}</span>
            </div>
            <div class="mt-1.5 space-y-0.5">
              <div v-for="e in threats.slice(0, ENEMY_ROWS)" :key="e.entity" class="flex items-baseline gap-1.5 whitespace-nowrap text-[13px]">
                <ClassIcon class="self-center" :class-name="e.className" :size="16" />
                <span class="max-w-[150px] truncate font-medium">{{ e.name }}</span>
                <span v-if="e.server" class="text-[11px] tabular-nums text-red">[{{ serverTag(e.server) }}]</span>
                <span v-if="e.combatPower" class="text-[11px] font-semibold tabular-nums text-yellow">[{{ e.combatPower.toLocaleString('en-US') }}]</span>
                <span v-if="e.legion" class="ml-auto min-w-0 truncate pl-3 text-[11px] text-darker">&lt;{{ e.legion }}&gt;</span>
              </div>
            </div>
            <div v-if="threats.length > ENEMY_ROWS" class="mt-0.5 text-[11px] text-darker">… {{ t('{n} more', { n: threats.length - ENEMY_ROWS }) }}</div>
            <div v-if="store.enemies.length > threats.length" class="mt-1.5 text-[11px] text-darker">
              {{ plural(store.enemies.length - threats.length, '{n} more in view has PvP off.', '{n} more in view have PvP off.') }}
            </div>
          </div>

          <!-- The map: around you, with the cube; or where you died. -->
          <div v-else-if="shown === 'map' || shown === 'cube' || shown === 'death'" class="flex gap-3">
            <div class="relative h-[200px] w-[240px] shrink-0 overflow-hidden rounded-lg border border-card">
              <WorldMap
                v-if="shown === 'death' && deathWorld && death"
                :world="deathWorld"
                :layers="NO_LAYERS"
                :focus="deathFocus"
                :you="death.place.world === worldId ? store.nearby.position : null"
                :death="death.place.position"
                :hint="false"
                class="!rounded-none"
              />
              <WorldMap
                v-else-if="shown !== 'death' && world"
                :world="world"
                :layers="NO_LAYERS"
                :focus="NO_FOCUS"
                :you="store.nearby.position"
                :cubes="cubePins"
                :enemies="enemyPins"
                :death="deathHere"
                :follow="store.settings.minimap.zoom"
                :hint="false"
                class="!rounded-none"
              />
              <p v-else class="p-2 text-[11px] text-darker">{{ t("Your zone isn't known yet: change zone (or teleport) and the map shows it.") }}</p>
            </div>
            <div class="flex w-[170px] flex-col gap-1.5 whitespace-normal">
              <template v-if="shown === 'death' && death">
                <span class="text-[13px] font-semibold">{{ t('Your last death') }}</span>
                <span class="text-xs text-dark">{{ t('Killed by {name}', { name: death.killer.name }) }}</span>
                <span class="text-[11px] text-darker">{{ deathWorld?.name }} · {{ ago(death.at) }}</span>
              </template>
              <template v-else-if="shown === 'cube'">
                <span class="text-[13px] font-semibold">{{ t('Hidden Cube') }}</span>
                <span v-if="cube && cube.distance !== null" class="text-xs text-dark">{{ meters(cube.distance) }} {{ cube.direction }}</span>
                <span class="text-[11px] text-darker">{{ world?.name }}</span>
              </template>
              <template v-else>
                <span class="text-[13px] font-semibold">{{ world?.name ?? t('Map') }}</span>
                <span v-if="store.cubes.length" class="text-xs text-yellow">{{ plural(store.cubes.length, '{n} cube', '{n} cubes') }}</span>
                <span v-if="threats.length" class="text-xs text-red">{{ plural(threats.length, '{n} can attack you', '{n} can attack you') }}</span>
              </template>
              <button v-if="peekHint && shown === 'map'" type="button" class="mt-auto self-start text-[11px] font-medium text-accent hover:underline" @pointerdown.stop @click="toggleOverlay('map')">{{ peekHint }}</button>
            </div>
          </div>

          <!-- The DPS meter's top rows. -->
          <div v-else-if="shown === 'meter'" class="w-[380px] whitespace-normal">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold">{{ t('DPS meter') }}</span>
              <span v-if="meter.target" class="truncate text-[11px] text-darker">{{ meter.target.name }} · {{ clock(meter.battleTime) }}</span>
            </div>
            <div v-if="meterTop.length" class="mt-1.5 space-y-1">
              <div v-for="r in meterTop" :key="r.id" class="relative h-6 overflow-hidden rounded-md bg-dark">
                <div class="absolute inset-y-0 left-0 opacity-35" :style="{ width: `${(r.value / meterMax) * 100}%`, background: (r.className && CLASS_COLORS[r.className]) || '#52525b' }" />
                <div class="relative flex h-6 items-center gap-1.5 px-2 text-xs">
                  <ClassIcon :class-name="r.className" :size="14" />
                  <span class="truncate font-semibold">{{ r.name }}</span>
                  <span class="ml-auto font-semibold tabular-nums">{{ short(r.perSecond) }}</span>
                  <span class="w-11 text-right tabular-nums text-dark">{{ r.part.toFixed(1) }}%</span>
                </div>
              </div>
            </div>
            <p v-else class="mt-1.5 text-xs text-darker">{{ t('Waiting for a fight') }}</p>
            <div class="mt-2 border-t border-card pt-1.5"><button type="button" class="text-[11px] font-medium text-accent hover:underline" @pointerdown.stop @click="toggleOverlay(shown as Peek)">{{ peekHint }}</button></div>
          </div>

          <!-- PvP: your kills, deaths and assists, the last kills, the last rift farm. -->
          <div v-else-if="shown === 'pvp'" class="w-[380px] whitespace-normal">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-[13px] font-semibold">PvP</span>
              <span class="rounded-md bg-dark px-1.5 py-0.5"><span class="font-semibold text-green">{{ pvpCounts.kills }}</span> {{ t('kills') }}</span>
              <span class="rounded-md bg-dark px-1.5 py-0.5"><span class="font-semibold text-red">{{ pvpCounts.deaths }}</span> {{ t('deaths') }}</span>
              <span class="rounded-md bg-dark px-1.5 py-0.5"><span class="font-semibold text-accent">{{ pvpCounts.assists }}</span> {{ t('assists') }}</span>
            </div>
            <div v-if="lastKills.length" class="mt-1.5 space-y-0.5 text-xs">
              <div v-for="k in lastKills" :key="`${k.at}-${k.killer.name}`" class="flex gap-1.5 whitespace-nowrap">
                <span :class="['max-w-[120px] truncate', k.mine ? 'font-semibold text-green' : '']">{{ k.killer.name }}</span>
                <span class="text-darker">{{ t('killed') }}</span>
                <span :class="['max-w-[120px] truncate', k.died ? 'font-semibold text-red' : '']">{{ k.victim?.name ?? t('someone') }}</span>
                <span class="ml-auto pl-3 text-darker">{{ ago(k.at) }}</span>
              </div>
            </div>
            <p v-else class="mt-1.5 text-xs text-darker">{{ t('No player kills seen yet.') }}</p>
            <div v-if="lastRift" class="mt-2 flex items-center gap-2 rounded-lg bg-dark px-2 py-1.5 text-xs">
              <span class="font-semibold">{{ t('PvP Rift {time} {day}', { time: startsAt(lastRift.start), day: day(lastRift.start) }) }}</span>
              <span class="ml-auto font-semibold tabular-nums text-blue">+{{ formatAmount(lastRift.points) }} AP</span>
            </div>
            <div class="mt-2 border-t border-card pt-1.5"><button type="button" class="text-[11px] font-medium text-accent hover:underline" @pointerdown.stop @click="toggleOverlay(shown as Peek)">{{ peekHint }}</button></div>
          </div>

          <!-- Pets: the ones whose soul monsters are around you. -->
          <div v-else-if="shown === 'pets'" class="w-[340px] whitespace-normal">
            <div class="flex items-baseline gap-2">
              <span class="text-[13px] font-semibold">{{ t('Pets nearby') }}</span>
              <span class="text-[11px] text-darker">{{ plural(store.sessionSouls, '+{n} soul this session', '+{n} souls this session') }}</span>
            </div>
            <div v-if="nearPets.length" class="mt-1.5 space-y-1">
              <div v-for="{ pet, count } in nearPets" :key="pet.id" class="flex items-center gap-2 text-xs">
                <PetIcon :id="pet.id" :size="20" />
                <span class="min-w-0 flex-1 truncate font-medium">{{ displayName(pet) }}</span>
                <span class="tabular-nums text-darker">×{{ count }}</span>
                <span class="w-12 text-right tabular-nums text-dark">{{ progress(pet) }}</span>
                <span class="w-7 text-right text-[11px] font-semibold text-accent">Lv{{ pet.level }}</span>
              </div>
            </div>
            <p v-else class="mt-1.5 text-xs text-darker">{{ t('No soul monsters around you.') }}</p>
            <div class="mt-2 border-t border-card pt-1.5"><button type="button" class="text-[11px] font-medium text-accent hover:underline" @pointerdown.stop @click="toggleOverlay(shown as Peek)">{{ peekHint }}</button></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
