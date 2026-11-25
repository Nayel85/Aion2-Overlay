<script setup lang="ts">
// The dashboard the bubble opens: a window of its own, with its title bar (dragged to move, and the
// window's buttons), a sidebar of pages in sections (questlog.gg's layout: Home, In game, Records,
// Settings at the bottom), and the page. Each page says what it is, and holds its overlay's settings.
import { useNow } from '@/lib/now.ts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BossesView from '@/components/dashboard/BossesView.vue'
import ChangelogView from '@/components/dashboard/ChangelogView.vue'
import CharactersView from '@/components/dashboard/CharactersView.vue'
import UpdatesView from '@/components/dashboard/UpdatesView.vue'
import EventsView from '@/components/dashboard/EventsView.vue'
import GatherablesView from '@/components/dashboard/GatherablesView.vue'
import HistoryView from '@/components/dashboard/HistoryView.vue'
import BestsView from '@/components/dashboard/BestsView.vue'
import StatsView from '@/components/dashboard/StatsView.vue'
import SessionsView from '@/components/dashboard/SessionsView.vue'
import InventoryView from '@/components/dashboard/InventoryView.vue'
import OverlaysView from '@/components/dashboard/OverlaysView.vue'
import { OVERLAY_PAGES, type OverlayEntryId } from '@/lib/overlayList.ts'
import DutyView from '@/components/dashboard/DutyView.vue'
import DetailsPage from '@/pages/DetailsPage.vue'
import StorageView from '@/components/dashboard/StorageView.vue'
import HomeView from '@/components/dashboard/HomeView.vue'
import MapView from '@/components/dashboard/MapView.vue'
import PetsView from '@/components/dashboard/PetsView.vue'
import SettingsView from '@/components/dashboard/SettingsView.vue'
import TrainingView from '@/components/dashboard/TrainingView.vue'
import PetDetail from '@/components/panel/PetDetail.vue'
import PvpLogTab from '@/components/panel/PvpLogTab.vue'
import SessionTab from '@/components/panel/SessionTab.vue'
import StatusDot, { statusText } from '@/components/StatusDot.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { timerNext } from '@/lib/timerView.ts'
import { useApp } from '@/stores/app.ts'
import { DISPLAY_NAME } from '@shared/app.ts'
import { CHANGELOG } from '@shared/changelog.ts'
import { serverName } from '@shared/servers.ts'
import { TIMERS, type TimerId } from '@shared/timers.ts'
import type { UpdateState } from '@shared/update.ts'

type PageId = 'home' | 'characters' | 'overlays' | 'training' | 'map' | 'pets' | 'gatherables' | 'pvp' | 'events' | 'bosses' | 'duty' | 'history' | 'bests' | 'session' | 'sessions' | 'stats' | 'inventory' | 'cache' | 'settings' | 'updates' | 'changes'
interface Page {
  id: PageId
  label: string
  /** An SVG path, 16x16, stroked. */
  icon: string
  /** An emoji shown in its place (a page worth standing out). */
  emoji?: string
}

const PAGES: Record<PageId, Page> = {
  home: { id: 'home', label: 'Home', icon: 'M2.5 7 8 2.5 13.5 7v6.5h-3.5v-4H6v4H2.5z' },
  overlays: { id: 'overlays', label: 'Overlays', icon: 'M2.5 3.5h11v9h-11zM5 6.5h6M5 9.5h3' },
  characters: { id: 'characters', label: 'Characters', icon: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 7a2 2 0 1 0 0-4M12.5 9.7c1.2.6 2 1.9 2 3.3' },
  training: { id: 'training', label: 'Training Dummy', icon: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 8h.01' },
  map: { id: 'map', label: 'Map', icon: 'M1.5 4l4.5-2 4 2 4.5-2v10l-4.5 2-4-2-4.5 2zM6 2v10M10 4v10' },
  pets: { id: 'pets', label: 'Pets', icon: 'M5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM11 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM3 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM13 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 9c-2 0-3.5 2-3.5 3.3 0 1 1 1.2 2.2 1.2.6 0 .9-.3 1.3-.3s.7.3 1.3.3c1.2 0 2.2-.2 2.2-1.2C11.5 11 10 9 8 9Z' },
  gatherables: { id: 'gatherables', label: 'Gatherables', icon: 'M3 13.5c1-4 3.5-7 9-10.5-1 4.5-3.5 8-9 10.5zM3 13.5 8 8.5' },
  pvp: { id: 'pvp', label: 'PvP', icon: 'M3 13 13 3M9.5 3H13v3.5M3 3l4 4M13 13l-3-3' },
  events: { id: 'events', label: 'Event Alerts', icon: 'M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11zM6.5 14h3' },
  bosses: { id: 'bosses', label: 'Field Bosses', icon: 'M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5' },
  duty: { id: 'duty', label: 'Duty board', icon: 'M3.5 2.5h9v11h-9zM5.5 5.5h5M5.5 8h5M5.5 10.5h3' },
  history: { id: 'history', label: 'Combat history', icon: 'M2 8a6 6 0 1 0 1.8-4.3M2 2.5v3h3M8 5v3l2 1.5', emoji: '💪' },
  bests: { id: 'bests', label: 'Personal bests', icon: 'M5 2.5h6v3a3 3 0 0 1-6 0zM5 3.5H3v1a2 2 0 0 0 2 2M11 3.5h2v1a2 2 0 0 1-2 2M8 8.5v3M5.5 13.5h5' },
  cache: { id: 'cache', label: 'Cache', icon: 'M2.5 4.5C2.5 3.4 5 2.5 8 2.5s5.5.9 5.5 2S11 6.5 8 6.5 2.5 5.6 2.5 4.5ZM2.5 4.5v7c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-7M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2' },
  sessions: { id: 'sessions', label: 'Past sessions', icon: 'M2.5 3.5h11M2.5 8h11M2.5 12.5h7M12 11l1.5 1.5L16 10' },
  inventory: { id: 'inventory', label: 'Inventory', icon: 'M3 5.5h10v8H3zM5.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5M3 9h10' },
  stats: { id: 'stats', label: 'Stats', icon: 'M2.5 13.5h11M4 11V7M7 11V4M10 11V8M13 11V5.5' },
  session: { id: 'session', label: 'Session', icon: 'M2.5 11.5 6 8l2.5 2.5 5-5M10 5.5h3.5V9' },
  updates: { id: 'updates', label: 'Updates', icon: 'M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11' },
  changes: { id: 'changes', label: "What's new", icon: 'M8 1.5 9.8 6l4.7.4-3.6 3 1.1 4.6L8 11.6 4 14l1.1-4.6-3.6-3L6.2 6z' },
  settings: { id: 'settings', label: 'Settings', icon: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM13 8a5 5 0 0 0-.1-.9l1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.5-.9L9.4 1.5H6.6l-.3 1.8a5 5 0 0 0-1.5.9l-1.7-.6-1.4 2.4 1.4 1.1a5 5 0 0 0 0 1.8l-1.4 1.1 1.4 2.4 1.7-.6a5 5 0 0 0 1.5.9l.3 1.8h2.8l.3-1.8a5 5 0 0 0 1.5-.9l1.7.6 1.4-2.4-1.4-1.1c.1-.3.1-.6.1-.9Z' },
}
const SECTIONS: { title: string | null; pages: PageId[] }[] = [
  { title: null, pages: ['home', 'characters', 'overlays'] },
  { title: 'In game', pages: ['map', 'pets', 'gatherables', 'duty', 'events', 'bosses', 'pvp', 'training'] },
  { title: 'Records', pages: ['history', 'bests', 'session', 'sessions', 'stats', 'inventory', 'cache'] },
  { title: 'App', pages: ['updates', 'changes'] },
]
/** The pages kept as they were (their old tabs), with the title and text above them. */
const ABOUT: Partial<Record<PageId, string>> = {
  pvp: 'Every player killed around you, as the game credits it. The kill feed shows them over the game.',
  session: 'This session: souls, crystals, Kina and Abyss Points.',
}
const store = useApp()
const api = bridge()

/** The page shown: Home each time the app starts, then where you left it while it runs. */
const page = ref<PageId>('home')
/** The overlay picked on the Overlays page. */
const overlay = ref<OverlayEntryId>('unified')
/** A page by its id; `overlays:<id>` opens the Overlays page on that one, as do the overlays' former pages. */
function go(p: string): void {
  const [head, sub] = p.split(':') as [string, string | undefined]
  const was = OVERLAY_PAGES[head]
  if (head === 'overlays' || was) {
    overlay.value = (sub ?? was ?? overlay.value) as OverlayEntryId
    page.value = 'overlays'
    store.openPet(null)
    return
  }
  const id = (head in PAGES ? head : 'home') as PageId
  if (id !== 'pets') store.openPet(null)
  page.value = id
}
// A pet opened from another page (Session's list): its drop locations are on Pets.
watch(
  () => store.openPetId,
  (id) => {
    if (id !== null) page.value = 'pets'
  },
)
const main = ref<HTMLElement | null>(null)
watch(page, () => main.value?.scrollTo({ top: 0 }))

/** A page's "New" tag in the sidebar stays for the version that brought it: until the changelog has a newer one. */
const NEW_IN: Partial<Record<PageId, string>> = { overlays: '0.3.18' }
const isNew = (id: PageId): boolean => NEW_IN[id] !== undefined && CHANGELOG[0]?.version === NEW_IN[id]

/** The PvP fight open in the PvP page (its id), if any. */
const pvpFight = ref<string | null>(null)

const maximized = ref(false)
/**
 * An update found (main/updater.ts looks now and then): a yellow pill by the app's name and the
 * Updates page glowing yellow in the sidebar, until it is installed.
 */
const update = ref<UpdateState | null>(null)
const newer = computed(() => !!update.value && ['available', 'downloading', 'ready'].includes(update.value.status))
const version = ref<string | null>(null)
const minimize = (): void => void api.invoke('panel:minimize')
const arrange = (on: boolean): void => void api.invoke('panel:arrange', on)
const maximize = (): void => void api.invoke('panel:maximize')
const hide = (): void => void api.invoke('panel:hide')

/** Who is playing, as the title bar shows it: "Ksix · Kaisinel". */
const who = computed(() => {
  const s = store.status
  return [s?.character, s?.server ? serverName(s.server) : null].filter(Boolean).join(' · ')
})

// The sidebar's badges: the next event with an alert on, how long until it; the bosses alive.
const now = useNow(30_000)
const nextAlert = computed(() => {
  const t = store.settings.timers
  const at = TIMERS.filter((d) => t.enabled[d.id] && t.shown[d.id] && d.schedule.kind !== 'boss').map((d) => timerNext(d, now.value))
  const soonest = Math.min(...at)
  if (!Number.isFinite(soonest)) return null
  const min = Math.max(0, Math.round((soonest - now.value) / 60_000))
  return min < 60 ? `${min}m` : min < 24 * 60 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`
})
const badge = computed<Partial<Record<PageId, string>>>(() => {
  const up = Object.values(store.fieldBosses).filter((b) => b.up).length
  return {
    events: nextAlert.value ?? undefined,
    bosses: up ? String(up) : undefined,
    overlays: isNew('overlays') ? t('New') : undefined,
    pets: store.sessionSouls ? `+${store.sessionSouls}` : undefined,
    updates:
      update.value?.status === 'downloading' ? `${update.value.percent}%` : update.value && ['available', 'ready'].includes(update.value.status) ? t('New') : undefined,
  }
})

// Escape backs out of a pet's map, else puts the dashboard away (back to the game). In a text box
// it leaves the box first.
const onKey = (e: KeyboardEvent): void => {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  const t = e.target
  if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return t.blur()
  if (store.openPetId !== null) return store.openPet(null)
  hide()
}
const offs: (() => void)[] = []
onMounted(() => {
  window.addEventListener('keydown', onKey)
  void api.invoke('app:info').then((i) => (version.value = i.version))
  // A pet clicked in the merchant window: its drop locations.
  offs.push(
    api.on('panel:showPet', (pet) => {
      page.value = 'pets'
      store.openPet(pet)
    }),
  )
  // The bubble clicked during an alert: the page of the timers that alerted, on them.
  offs.push(
    api.on('panel:showTimers', (ids: TimerId[]) => {
      store.openPet(null)
      page.value = ids.every((id) => TIMERS.find((d) => d.id === id)?.schedule.kind === 'boss') ? 'bosses' : 'events'
      store.timerFocus = { ids, at: Date.now() }
    }),
  )
  // The Unified HUD's Odyle energy clicked: your characters' energy, entries and Kina.
  offs.push(
    api.on('panel:showCharacters', () => {
      store.openPet(null)
      page.value = 'characters'
    }),
  )
  offs.push(api.on('panel:maximized', (m) => (maximized.value = m)))
  offs.push(api.on('update:state', (s) => (update.value = s)))
  void api.invoke('update:get').then((s) => (update.value = s))
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  for (const off of offs) off()
})
</script>

<template>
  <div class="flex h-screen flex-col bg-app text-default">
    <!-- The title bar: dragged to move the window (its buttons excepted). -->
    <header class="drag flex h-10 shrink-0 items-center border-b border-card">
      <div class="flex h-full w-60 shrink-0 items-center gap-2 border-r border-card px-4">
        <img src="/icon.png" alt="" class="size-[18px]" draggable="false" />
        <span class="text-sm font-semibold">{{ DISPLAY_NAME }}</span>
        <button
          v-if="newer && update"
          type="button"
          class="no-drag min-w-0 truncate rounded-full border border-yellow/50 bg-yellow/15 px-2 py-0.5 text-[11px] font-medium text-yellow hover:bg-yellow/25"
          :title="
            update.status === 'ready'
              ? t('Restart to update to {v}', { v: update.latest ?? '' })
              : update.status === 'downloading'
                ? t('Downloading {v}… {p}%', { v: update.latest ?? '', p: update.percent })
                : t('Update {v} available', { v: update.latest ?? '' })
          "
          @click="go('updates')"
        >
          {{ update.status === 'ready' ? t('Restart to update') : update.status === 'downloading' ? `${update.percent}%` : t('New version') }}
        </button>
      </div>
      <div class="flex min-w-0 flex-1 items-center gap-2 px-4">
        <span
          :class="[
            'flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium',
            store.status?.state === 'locked' && store.status.gameActive ? 'border-green/30 bg-green/10 text-green' : 'border-card bg-dark text-darker',
          ]"
        >
          <StatusDot :status="store.status" />
          <span class="truncate">{{ t(statusText(store.status)) }}</span>
          <span v-if="who" class="truncate text-dark">· {{ who }}</span>
        </span>
        <span v-if="store.sessionSouls" class="rounded-full border border-card bg-dark px-2.5 py-0.5 text-xs text-green">{{ t('+{n} souls this session', { n: store.sessionSouls }) }}</span>
      </div>
      <div class="no-drag flex h-full">
        <!-- Placing the overlays, when it does not come with this window. -->
        <button
          v-if="!store.settings.arrangeWithPanel"
          type="button"
          :class="['flex items-center gap-1.5 px-3 text-xs', store.panelVisible ? 'bg-accent/15 text-accent' : 'text-darker hover:bg-dark hover:text-default']"
          :title="store.panelVisible ? t('Done placing the overlays') : t('Place the overlays: they show their samples, to be dragged')"
          @click="arrange(!store.panelVisible)"
        >
          <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5v13M1.5 8h13M8 1.5 6.3 3.2M8 1.5l1.7 1.7M8 14.5l-1.7-1.7M8 14.5l1.7-1.7M1.5 8l1.7-1.7M1.5 8l1.7 1.7M14.5 8l-1.7-1.7M14.5 8l-1.7 1.7" /></svg>
          {{ store.panelVisible ? t('Done') : t('Place overlays') }}
        </button>
        <button type="button" class="flex w-12 items-center justify-center text-darker hover:bg-dark hover:text-default" :title="t('Minimize')" @click="minimize">
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M3.5 8h9" /></svg>
        </button>
        <button type="button" class="flex w-12 items-center justify-center text-darker hover:bg-dark hover:text-default" :title="maximized ? t('Restore') : t('Maximize')" @click="maximize">
          <svg v-if="!maximized" viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3.5" y="3.5" width="9" height="9" rx="0.5" /></svg>
          <svg v-else viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5.5 5.5V3.5h7v7h-2M3.5 5.5h7v7h-7z" /></svg>
        </button>
        <button type="button" class="flex w-12 items-center justify-center text-darker hover:bg-[#e81123] hover:text-white" :title="t('Close to the taskbar (quit from the tray icon)')" @click="hide">
          <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <nav class="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-card px-2.5 py-3">
        <div v-for="(s, n) in SECTIONS" :key="s.title ?? ''" :class="n > 0 && 'mt-5'">
          <div v-if="s.title" class="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-wider text-darkest">{{ t(s.title) }}</div>
          <button
            v-for="id in s.pages"
            :key="id"
            type="button"
            :class="[
              'relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors',
              id === 'updates' && newer
                ? 'glow bg-yellow/10 font-medium text-yellow ring-1 ring-yellow/40 hover:bg-yellow/20'
                : page === id
                  ? 'bg-dark font-medium text-default'
                  : 'text-dark hover:bg-dark hover:text-default',
            ]"
            @click="go(id)"
          >
            <span v-if="page === id" :class="['absolute -left-2.5 top-1.5 h-5 w-[3px] rounded-r', id === 'updates' && newer ? 'bg-yellow' : 'bg-accent']" />
            <span v-if="PAGES[id].emoji" class="flex size-4 shrink-0 items-center justify-center text-[15px] leading-none" aria-hidden="true">{{ PAGES[id].emoji }}</span>
            <svg v-else viewBox="0 0 16 16" :class="['size-4 shrink-0', id === 'updates' && newer ? 'text-yellow' : page === id ? 'text-accent' : 'text-darker']" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path :d="PAGES[id].icon" />
            </svg>
            <span class="min-w-0 flex-1 truncate">{{ t(PAGES[id].label) }}</span>
            <span
              v-if="badge[id]"
              :class="[
                'shrink-0 rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                id === 'updates' && newer ? 'bg-yellow/20 text-yellow' : id === 'overlays' ? 'bg-accent text-[#0b1220]' : page === id ? 'bg-accent/20 text-accent' : 'bg-dark text-darker',
              ]"
            >{{ badge[id] }}</span>
          </button>
        </div>
        <div class="mt-auto border-t border-card pt-3">
          <button
            type="button"
            :class="[
              'relative flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm transition-colors',
              page === 'settings' ? 'bg-dark font-medium text-default' : 'text-dark hover:bg-dark hover:text-default',
            ]"
            @click="go('settings')"
          >
            <span v-if="page === 'settings'" class="absolute -left-2.5 top-1.5 h-5 w-[3px] rounded-r bg-accent" />
            <svg viewBox="0 0 16 16" :class="['size-4 shrink-0', page === 'settings' ? 'text-accent' : 'text-darker']" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
              <path :d="PAGES.settings.icon" />
            </svg>
            {{ t('Settings') }}
          </button>
          <button
            v-if="version"
            type="button"
            :class="['px-2.5 pt-2 text-[11px] hover:text-default hover:underline', page === 'updates' ? 'text-default' : 'text-darkest']"
            :title="t('Updates')"
            @click="go('updates')"
          >
            v{{ version }}
          </button>
        </div>
      </nav>

      <main ref="main" class="min-w-0 flex-1 overflow-y-auto">
        <div :class="['mx-auto px-8 py-7', ['settings', 'updates', 'changes'].includes(page) ? 'max-w-4xl' : page === 'history' || page === 'bests' || (page === 'pvp' && pvpFight) ? 'max-w-[1700px]' : 'max-w-6xl']">
          <div v-if="!store.ready" class="py-6 text-center text-sm text-darker">{{ t('Loading…') }}</div>
          <HomeView v-else-if="page === 'home'" @go="go" />
          <CharactersView v-else-if="page === 'characters'" />
          <TrainingView v-else-if="page === 'training'" />
          <MapView v-else-if="page === 'map'" />
          <template v-else-if="page === 'pets'">
            <PetDetail v-if="store.openPetId !== null" :id="store.openPetId" class="-mx-3 h-[calc(100vh-7rem)]" />
            <PetsView v-else />
          </template>
          <GatherablesView v-else-if="page === 'gatherables'" />
          <EventsView v-else-if="page === 'events'" />
          <BossesView v-else-if="page === 'bosses'" />
          <HistoryView v-else-if="page === 'history'" />
          <BestsView v-else-if="page === 'bests'" />
          <StatsView v-else-if="page === 'stats'" />
          <SessionsView v-else-if="page === 'sessions'" />
          <InventoryView v-else-if="page === 'inventory'" />
          <OverlaysView v-else-if="page === 'overlays'" v-model="overlay" />
          <DutyView v-else-if="page === 'duty'" />
          <StorageView v-else-if="page === 'cache'" />
          <SettingsView v-else-if="page === 'settings'" @go="go" />
          <UpdatesView v-else-if="page === 'updates'" @go="go" />
          <ChangelogView v-else-if="page === 'changes'" :version="version" />
          <template v-else>
            <!-- A PvP fight opens in place of the list, like a saved fight in Combat history. -->
            <DetailsPage v-if="page === 'pvp' && pvpFight" :key="pvpFight" :source="{ kind: 'pvp', id: pvpFight }" @back="pvpFight = null" />
            <div v-show="!(page === 'pvp' && pvpFight)">
              <PageHeader :title="PAGES[page].label" :about="ABOUT[page]" />
              <PvpLogTab v-if="page === 'pvp'" class="-mx-3" @open="pvpFight = $event" />
              <SessionTab v-else class="-mx-3" @history="go('sessions')" />
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.drag {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}
/* The Updates page with a new version out: a soft yellow glow, breathing. */
@keyframes glow {
  0%,
  100% {
    box-shadow: 0 0 6px rgb(251 191 36 / 0.25);
  }
  50% {
    box-shadow: 0 0 14px rgb(251 191 36 / 0.55);
  }
}
.glow {
  animation: glow 2.4s ease-in-out infinite;
}
</style>
