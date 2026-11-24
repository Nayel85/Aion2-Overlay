<script setup lang="ts">
// Settings: the app's own only (language, you and the game, this window, sound, what the per hour
// figures count, shortcuts, the Lokthar sync, the engine). Each overlay is set on its own page, listed
// under Overlays. Every change applies at once.
import { timeOfDay } from '@/lib/format.ts'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from '@/components/Button.vue'
import StatusDot, { statusText } from '@/components/StatusDot.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import type { SyncResult } from '@shared/lokthar.ts'
import { NO_PACKET_LOG, type PacketLog } from '@shared/meter.ts'
import { LANGS } from '@shared/i18n.ts'
import { serverLabel } from '@shared/servers.ts'

const store = useApp()
const info = ref<{ version: string; settingsFile: string; logFile: string } | null>(null)
onMounted(async () => (info.value = await bridge().invoke('app:info')))



// The Lokthar sync: the site and its token, a connection check, and how the last post went.
const siteUrl = ref(store.settings.lokthar.url)
const token = ref(store.settings.lokthar.token)
const syncResult = ref<SyncResult | null>(null)
const testing = ref(false)
onMounted(async () => (syncResult.value = await bridge().invoke('lokthar:last')))
const saveLokthar = (patch: Partial<typeof store.settings.lokthar>): Promise<void> =>
  store.set('lokthar', { ...store.settings.lokthar, ...patch })
async function testSync(): Promise<void> {
  testing.value = true
  await saveLokthar({ url: siteUrl.value.trim(), token: token.value.trim() })
  syncResult.value = await bridge().invoke('lokthar:test')
  testing.value = false
}
/** Send the field bosses as your map last listed them, now. */
const syncing = ref(false)
async function syncNow(): Promise<void> {
  syncing.value = true
  await saveLokthar({ url: siteUrl.value.trim(), token: token.value.trim() })
  syncResult.value = await bridge().invoke('lokthar:sync')
  syncing.value = false
}
/**
 * Who you are, as the game says: your side (its zones first where a soul drops), your region (the
 * timers') and your level (the Nearby marks) all come from it. Before the game names you, the last
 * ones seen.
 */
const who = computed(() => {
  const s = store.status
  const level = s?.level ?? store.settings.playerLevel
  const parts = [
    s?.character,
    s?.server ? serverLabel(s.server) : store.settings.faction === 'asmodians' ? 'Asmodian' : 'Elyos',
    level ? `Lv ${level}` : null,
  ].filter(Boolean)
  return {
    value: parts.join(' · '),
    hint: s?.server
      ? 'Read from the game: your side, region and level follow your character.'
      : 'Read from the game when you enter the world; until then, the last ones seen.',
  }
})


const emit = defineEmits<{ go: [page: string] }>()


// Developer: the packet log, every game message as a text line, and marks to find them by.
const packetLog = ref<PacketLog>({ ...NO_PACKET_LOG })
const markText = ref('')
let offPackets: (() => void) | null = null
onMounted(async () => {
  offPackets = bridge().on('packets:state', (s) => (packetLog.value = s))
  packetLog.value = await bridge().invoke('packets:get')
})
onBeforeUnmount(() => offPackets?.())
const fileName = (path: string): string => path.split(/[\\/]/).pop() ?? path
function addMark(): void {
  void bridge().invoke('packets:mark', markText.value.trim())
  markText.value = ''
}
/** Every overlay over the game, each set on its own page. */
const OVERLAY_PAGES = [
  { page: 'unified', name: 'Unified HUD', where: 'Unified HUD' },
  { page: 'meter', name: 'Damage meter and My skills', where: 'Combat Meter' },
  { page: 'buffs', name: 'Buffs and CC', where: 'Buffs' },
  { page: 'party', name: 'Party frames', where: 'Party frames' },
  { page: 'flight', name: 'Flight timer', where: 'Flight timer' },
  { page: 'gather', name: 'Gathering outcome', where: 'Gathering outcome' },
  { page: 'applicants', name: 'Join requests', where: 'Join requests' },
  { page: 'pvp', name: 'Kill feed and Enemies nearby', where: 'PvP' },
  { page: 'map', name: 'Map', where: 'Map' },
  { page: 'mapv2', name: 'Markers on the game\'s map', where: 'Map V2' },
  { page: 'pets', name: 'Pets HUD', where: 'Pets' },
  { page: 'events', name: 'Countdown bar', where: 'Event Alerts' },
  { page: 'training', name: 'Training', where: 'Training Dummy' },
]

const lastPacket = computed(() => {
  const ago = store.status?.lastPacketAgo
  return ago === null || ago === undefined ? t('never') : ago < 5 ? t('just now') : t('{n} s ago', { n: Math.round(ago) })
})
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <PageHeader title="Settings" />

    <Section title="Language and time" icon="M2 8h12M8 2a9 9 0 0 1 0 12M8 2a9 9 0 0 0 0 12M8 2a6 6 0 1 1 0 12A6 6 0 0 1 8 2z">
      <SettingRow label="Language" hint="Game words (PvP, DPS, skills, buffs, bosses, pets...) stay as the community says them.">
        <Segmented :model-value="store.settings.language" :options="LANGS" @update:model-value="store.set('language', $event)" />
      </SettingRow>
      <SettingRow label="24-hour clock" hint="Times as 15:30 rather than 3:30 PM, in every window.">
        <Toggle :model-value="store.settings.clock24" @update:model-value="store.set('clock24', $event)" />
      </SettingRow>
    </Section>

    <Section title="You and the game" icon="M2.5 3.5h11v9h-11zM2.5 6h11">
      <SettingRow label="Character" :hint="who.hint">
        <span class="text-sm text-dark">{{ who.value }}</span>
      </SettingRow>
      <SettingRow label="Sleep while Aion 2 is closed" hint="No overlays or capture until the game starts: only the tray icon, which still opens this window.">
        <Toggle :model-value="store.settings.sleepWithoutGame" @update:model-value="store.set('sleepWithoutGame', $event)" />
      </SettingRow>
      <SettingRow label="Hide when the game is not in front" hint="Alt-tab to another program and the overlays hide; they come back with the game.">
        <Toggle :model-value="store.settings.hideWhenGameAway" @update:model-value="store.set('hideWhenGameAway', $event)" />
      </SettingRow>
      <SettingRow label="Hide from screen recordings" hint="Keeps the overlays and this window out of OBS, Discord and screenshots.">
        <Toggle :model-value="store.settings.hideFromCapture" @update:model-value="store.set('hideFromCapture', $event)" />
      </SettingRow>
    </Section>

    <Section title="This window" icon="M2.5 2.5h11v11h-11zM2.5 5.5h11">
      <SettingRow label="Keep this window on top" hint="It stays above the game while open.">
        <Toggle :model-value="store.settings.panelOnTop" @update:model-value="store.set('panelOnTop', $event)" />
      </SettingRow>
      <SettingRow label="Hide when you click the game" hint="Click from this window into the game and it goes down to the taskbar; Alt+E brings it back.">
        <Toggle :model-value="store.settings.panelHideOnGame" @update:model-value="store.set('panelHideOnGame', $event)" />
      </SettingRow>
    </Section>

    <Section title="Sound" icon="M2.5 6v4h2.5l3.5 3V3L5 6zM11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9">
      <SettingRow label="Mute every sound" hint="Cubes, enemies and the timers' chime: the same switch as the speaker on the Unified HUD.">
        <Toggle :model-value="store.settings.muted" @update:model-value="store.set('muted', $event)" />
      </SettingRow>
    </Section>

    <Section title="Kina and Abyss Points" icon="M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 4.5v7">
      <SettingRow label="Dungeons in Kina per hour" hint="The per hour figures count your farming, never rewards (quests, supply requests, duty missions). With this on, what dungeons give (their monsters, their cube) counts too. The session's totals count everything.">
        <Toggle :model-value="store.settings.rates.kinaDungeons" @update:model-value="store.set('rates', { ...store.settings.rates, kinaDungeons: $event })" />
      </SettingRow>
      <SettingRow label="Dungeons in Abyss Points per hour" hint="The same for the Abyss Points per hour.">
        <Toggle :model-value="store.settings.rates.abyssDungeons" @update:model-value="store.set('rates', { ...store.settings.rates, abyssDungeons: $event })" />
      </SettingRow>
    </Section>

    <Section title="Overlays" icon="M8 1.5 14.5 5 8 8.5 1.5 5zM1.5 8 8 11.5 14.5 8M1.5 11 8 14.5 14.5 11">
      <button v-for="o in OVERLAY_PAGES" :key="o.page" type="button" class="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-accent" @click="emit('go', o.page)">
        <span class="text-sm">{{ t(o.name) }}</span>
        <span class="flex items-center gap-1 text-xs text-darker">{{ t('on the {page} page', { page: t(o.where) }) }}
          <svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m6 4 4 4-4 4" /></svg>
        </span>
      </button>
    </Section>

    <Section title="Shortcuts" icon="M1.5 4h13v8h-13zM4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M5 9.5h6">
      <SettingRow label="Open or hide this window"><kbd class="rounded border border-light bg-dark px-1.5 py-0.5 text-xs">Alt+E</kbd></SettingRow>
      <SettingRow label="Hide or show every overlay"><kbd class="rounded border border-light bg-dark px-1.5 py-0.5 text-xs">Alt+Shift+E</kbd></SettingRow>
    </Section>

    <Section title="Lokthar sync" icon="M13.5 6A5.5 5.5 0 0 0 3 5M2.5 10A5.5 5.5 0 0 0 13 11M3 2v3h3M13 14v-3h-3">
      <SettingRow label="Sync field bosses" hint="Sends the field boss list your map shows (ids, up or dead, times, your server) to the Lokthar timers. Nothing else, and only to the site below.">
        <Toggle :model-value="store.settings.lokthar.sync" @update:model-value="saveLokthar({ sync: $event })" />
      </SettingRow>
      <div class="grid grid-cols-2 gap-3 py-3 text-xs">
        <label class="block">
          <span class="text-darker">{{ t('Site') }}</span>
          <input v-model="siteUrl" class="mt-1 h-8 w-full rounded-md border border-light bg-default px-2.5 text-sm" placeholder="https://lokthar.com" @change="saveLokthar({ url: siteUrl.trim() })" />
        </label>
        <label class="block">
          <span class="text-darker">Token</span>
          <input v-model="token" type="password" autocomplete="off" class="mt-1 h-8 w-full rounded-md border border-light bg-default px-2.5 text-sm" placeholder="lkt_…" @change="saveLokthar({ token: token.trim() })" />
        </label>
      </div>
      <div class="flex items-center justify-between gap-2 py-3 text-xs">
        <span v-if="syncResult" :class="['min-w-0 truncate', syncResult.ok ? 'text-darker' : 'text-red']" :title="syncResult.message">{{ timeOfDay(syncResult.at) }}: {{ syncResult.message }}</span>
        <span v-else class="text-darkest">{{ t('Not synced yet') }}</span>
        <div class="flex shrink-0 gap-2">
          <Button size="sm" :disabled="testing" @click="testSync">{{ testing ? t('Testing…') : t('Test') }}</Button>
          <Button size="sm" :disabled="syncing || !token.trim()" :title="t('Send the field bosses as your map last listed them')" @click="syncNow">{{ syncing ? t('Syncing…') : t('Sync now') }}</Button>
        </div>
      </div>
    </Section>

    <Section title="Engine and diagnostics" icon="M5.5 1.5v2M10.5 1.5v2M5.5 12.5v2M10.5 12.5v2M1.5 5.5h2M1.5 10.5h2M12.5 5.5h2M12.5 10.5h2M3.5 3.5h9v9h-9zM6 6h4v4H6z">
      <SettingRow label="State" :hint="store.status?.detail ?? t('Last game packet: {when}', { when: lastPacket })" :warning="store.status?.state === 'error' ? 'The game\'s traffic is not being read.' : undefined">
        <span class="flex items-center gap-2 text-sm text-dark"><StatusDot :status="store.status" />{{ t(statusText(store.status)) }}</span>
      </SettingRow>
      <SettingRow label="Collection file" hint="Your pets' souls and levels, kept on this computer.">
        <Button v-if="store.status?.dataFile" size="sm" @click="bridge().invoke('app:openPath', store.status.dataFile)">{{ t('Show in folder') }}</Button>
      </SettingRow>
      <SettingRow label="Restart the engine" hint="If the overlays stop updating.">
        <Button size="sm" @click="bridge().invoke('tracker:restart')">{{ t('Restart') }}</Button>
      </SettingRow>
      <SettingRow
        label="Packet log"
        hint="Writes every game message to a text file (time, message type, bytes) to share for debugging or to find data for new features. Add marks as you do things in game to find their messages by time. Alt+Shift+R starts and stops it from the game. It grows fast in fights: keep it short."
      >
        <Button size="sm" :intent="packetLog.on ? 'primary' : undefined" @click="bridge().invoke('packets:set', !packetLog.on)">
          {{ packetLog.on ? t('Stop') : t('Start') }}
        </Button>
      </SettingRow>
      <div v-if="packetLog.on" class="flex items-center gap-2 py-3 text-xs">
        <span class="size-2 shrink-0 animate-pulse rounded-full bg-danger" />
        <span class="shrink-0 text-darker">{{ t('Recording') }}{{ packetLog.marks ? ` · ${plural(packetLog.marks, '{n} mark', '{n} marks')}` : '' }}</span>
        <input
          v-model="markText"
          class="h-8 min-w-0 flex-1 rounded-md border border-light bg-default px-2.5 text-sm placeholder:text-darkest"
          :placeholder="t('What you did, e.g. opened the map (Alt+Shift+M marks from the game)')"
          @keydown.enter="addMark"
        />
        <Button size="sm" @click="addMark">{{ t('Mark') }}</Button>
      </div>
      <div v-else-if="packetLog.path" class="flex items-center justify-between gap-2 py-3 text-xs">
        <span class="min-w-0 truncate text-darker" :title="packetLog.path">{{ t('Last: {file} · {n} messages', { file: fileName(packetLog.path), n: packetLog.count.toLocaleString('en-US') }) }}</span>
        <Button size="sm" @click="bridge().invoke('packets:show')">{{ t('Show in folder') }}</Button>
      </div>
      <SettingRow label="Field-boss diagnostics" hint="Searches other game messages for possible boss data and writes matches to the developer log.">
        <Toggle
          :aria-label="t('Field-boss diagnostics')"
          :model-value="store.settings.tracker.bossDiagnostics"
          @update:model-value="store.set('tracker', { ...store.settings.tracker, bossDiagnostics: $event })"
        />
      </SettingRow>
    </Section>

    <section class="flex items-center justify-between pb-4 text-xs text-darkest">
      <span>{{ t('Version {v}', { v: info?.version ?? '…' }) }}</span>
      <div class="flex gap-3">
        <button v-if="info" type="button" class="hover:text-default" @click="bridge().invoke('app:openPath', info.logFile)">{{ t('Show log') }}</button>
        <button v-if="info" type="button" class="hover:text-default" @click="bridge().invoke('app:openPath', info.settingsFile)">{{ t('Settings file') }}</button>
        <button type="button" class="text-red hover:underline" @click="bridge().invoke('app:quit')">{{ t('Quit') }}</button>
      </div>
    </section>
  </div>
</template>
