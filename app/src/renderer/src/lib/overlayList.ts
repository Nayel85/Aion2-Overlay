// Every overlay the app can put over the game, once: its name, what it shows, whether it is on and
// how to turn it on or off. Home lists them with their switches; the Overlays page lists them on its
// left, each opening its settings.
import { computed, type ComputedRef } from 'vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import type { Settings } from '@shared/settings.ts'

/** Its id on the Overlays page (`overlays:<id>` opens it there). */
export type OverlayEntryId =
  | 'unified' | 'meter' | 'skills' | 'party' | 'buffs' | 'cc' | 'flight' | 'gather' | 'applicants'
  | 'hud' | 'minimap' | 'gameMap' | 'timerbar' | 'killfeed' | 'enemies' | 'training' | 'merchant' | 'duty'
export interface OverlayEntry {
  id: OverlayEntryId
  name: string
  about: string
  on: boolean
  set: (on: boolean) => void
}
/** The dashboard pages that were an overlay's settings, now on the Overlays page. */
export const OVERLAY_PAGES: Record<string, OverlayEntryId> = {
  unified: 'unified', meter: 'meter', party: 'party', buffs: 'buffs', flight: 'flight', gather: 'gather', applicants: 'applicants', mapv2: 'gameMap',
}

export function useOverlayList(): ComputedRef<OverlayEntry[]> {
  const store = useApp()
  const flip = <K extends keyof Settings>(key: K, field: string) => (on: boolean): void =>
    void store.set(key, { ...(store.settings[key] as object), [field]: on } as unknown as Settings[K])
  return computed(() => {
    const s = store.settings
    return [
      { id: 'unified', name: t('Unified HUD'), about: t('One small bar at the top of the game'), on: s.unified.enabled, set: flip('unified', 'enabled') },
      { id: 'meter', name: t('DPS Meter'), about: t('You and your party, live'), on: s.meter.enabled, set: flip('meter', 'enabled') },
      { id: 'skills', name: t('My Skills'), about: t('Your damage, skill by skill'), on: s.skills.enabled, set: flip('skills', 'enabled') },
      { id: 'party', name: t('Party Frames'), about: t('Your party members and their HP'), on: s.party.enabled, set: flip('party', 'enabled') },
      { id: 'buffs', name: 'Buffs', about: t('What is on you, and for how long'), on: s.buffs.enabled, set: flip('buffs', 'enabled') },
      { id: 'cc', name: t('CC / Debuffs'), about: t('When you are stunned, rooted, feared…'), on: s.buffs.cc, set: flip('buffs', 'cc') },
      { id: 'flight', name: t('Flight Timer'), about: t('Seconds of flight left'), on: s.flight.enabled, set: flip('flight', 'enabled') },
      { id: 'gather', name: t('Gathering Outcome'), about: t('Fail, rank up or x2, as it starts'), on: s.gather.enabled, set: flip('gather', 'enabled') },
      { id: 'applicants', name: t('Join Requests'), about: t('Everyone who asks to join your party'), on: s.applicants.enabled, set: flip('applicants', 'enabled') },
      { id: 'hud', name: t('Soul Tracker'), about: t('Souls as they drop, soul monsters around you'), on: s.hud.enabled, set: flip('hud', 'enabled') },
      { id: 'minimap', name: t('Minimap'), about: t('Your zone, tracked pets, cubes'), on: s.minimap.enabled, set: flip('minimap', 'enabled') },
      { id: 'gameMap', name: t('Game Map Markers'), about: t("Pets, gatherables and cubes on the game's own map"), on: s.gameMap.enabled && !!s.gameMap.region, set: flip('gameMap', 'enabled') },
      { id: 'timerbar', name: t('Event Bar'), about: t('Events with an alert on'), on: s.timerBar.enabled, set: flip('timerBar', 'enabled') },
      { id: 'killfeed', name: t('Kill Feed'), about: t('Player kills around you'), on: s.killFeed.open, set: (on) => void bridge().invoke(on ? 'killfeed:open' : 'killfeed:close') },
      { id: 'enemies', name: t('Nearby Enemies'), about: t('Enemy players around you'), on: s.enemies.enabled, set: flip('enemies', 'enabled') },
      { id: 'training', name: t('Training'), about: t('Training dummy runs: clock and DPS'), on: s.dummy.overlay, set: flip('dummy', 'overlay') },
      { id: 'merchant', name: t('Black Cloud Merchant'), about: t('When you open the Black Cloud shop'), on: s.hud.merchant, set: flip('hud', 'merchant') },
      { id: 'duty', name: t('Duty Board'), about: t('When you open the duty board: the missions to take'), on: s.duty.overlay, set: flip('duty', 'overlay') },
    ] satisfies OverlayEntry[]
  })
}
