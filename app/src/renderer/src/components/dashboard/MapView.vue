<script setup lang="ts">
// Map: a zone's map with you on it (when you are in it), the Hidden Cubes in view, and the spawns
// of the pets you care about: pinned ones and those around you each in their own colour, and,
// optionally, every pet you still need in grey, and the gatherables (the ones pinned on the
// Gatherables page, or all). Any zone can be picked; it opens on yours. Its switches are kept as they
// were left (settings `mapPage`), and the Hidden Cubes' settings. The Minimap's and the Game Map
// Markers' settings are on the Overlays page.
import { BOSS_NPCS } from '@/lib/petSources.ts'
import { computed, ref, watch } from 'vue'
import Button from '@/components/Button.vue'
import PetIcon from '@/components/PetIcon.vue'
import SettingRow from '@/components/SettingRow.vue'
import SoundPicker from '@/components/SoundPicker.vue'
import Toggle from '@/components/Toggle.vue'
import WorldMap, { type MapLayer } from '@/components/WorldMap.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Section from '@/components/ui/Section.vue'
import SelectBox from '@/components/ui/SelectBox.vue'
import { gatherLayers, useGatherables } from '@/lib/gatherables.ts'
import { displayName } from '@/lib/petDb.ts'
import { currentWorld, nearbyPets, PET_COLORS, useSpawns } from '@/lib/spawns.ts'
import { plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { blankPet, MAX_LEVEL } from '@shared/tracker.ts'

const NEEDED = '#a1a1aa'

const store = useApp()
const spawns = useSpawns()

const here = computed(() => (spawns.value ? currentWorld(store.nearby, spawns.value) : null))
const picked = ref<number | null>(null)
const worldId = computed(() => picked.value ?? here.value ?? (spawns.value ? Number(Object.keys(spawns.value.worlds)[0]) : null))
const world = computed(() => (spawns.value && worldId.value !== null ? (spawns.value.worlds[worldId.value] ?? null) : null))
const zones = computed(() =>
  spawns.value
    ? Object.entries(spawns.value.worlds)
        .map(([id, w]) => ({ id: Number(id), label: `${w.name}${Number(id) === here.value ? ' (you are here)' : ''}` }))
        .sort((a, b) => a.label.localeCompare(b.label))
    : [],
)
/** Where you last died, when it was in the zone shown. */
const death = computed(() => {
  const d = store.pvpStats.death
  return d && d.place.world === worldId.value ? d.place.position : null
})
const inZone = computed(() => worldId.value !== null && worldId.value === here.value)

const page = computed(() => store.settings.mapPage)
const setPage = (patch: Partial<typeof page.value>): void => void store.set('mapPage', { ...page.value, ...patch })
const showNeeded = computed({ get: () => page.value.needed, set: (needed) => setPage({ needed }) })
const showCubes = computed({ get: () => page.value.cubes, set: (cubes) => setPage({ cubes }) })
const showGather = computed({ get: () => page.value.gatherables, set: (gatherables) => setPage({ gatherables }) })
const gather = useGatherables()
const icons = computed(() => (showGather.value ? gatherLayers(gather.value, worldId.value, store.settings.gatherables.pinned) : []))
const gatherCount = computed(() => icons.value.length)

const pet = (id: number) => store.pets.find((p) => p.id === id) ?? blankPet(id)
/** The pets with spawns in this zone, from a list of ids. */
function withSpawns(ids: number[]): number[] {
  return ids.filter((id) => (spawns.value?.pets[id] ?? []).some((d) => d.worlds.some((w) => w.world === worldId.value)))
}
/** Pinned, then the ones around you: each its colour. */
const tracked = computed(() => {
  if (!spawns.value) return []
  const near = inZone.value ? nearbyPets(store.nearby, spawns.value).map((n) => n.pet) : []
  return withSpawns([...new Set([...store.settings.hud.pinned, ...near])].filter((id) => !store.hiddenPet(id)))
    .slice(0, PET_COLORS.length)
    .map((id, i) => ({ id, color: PET_COLORS[i % PET_COLORS.length]!, pinned: store.settings.hud.pinned.includes(id) }))
})
/** Tracked pets whose spawns are hidden here (clicked off in the list). */
const hidden = computed(() => new Set(page.value.hiddenPets))
function flip(id: number): void {
  const next = new Set(hidden.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  setPage({ hiddenPets: [...next] })
}
/** Every pet still below the cap with spawns here (not the tracked ones). */
const needed = computed(() => {
  if (!spawns.value || !showNeeded.value) return []
  const trackedIds = new Set(tracked.value.map((t) => t.id))
  return withSpawns(Object.keys(spawns.value.pets).map(Number)).filter((id) => !trackedIds.has(id) && pet(id).level < MAX_LEVEL && !store.hiddenPet(id))
})

const layers = computed<MapLayer[]>(() => {
  const of = (id: number, color: string, active: boolean): MapLayer[] =>
    (spawns.value?.pets[id] ?? []).flatMap((d) => {
      const w = d.worlds.find((x) => x.world === worldId.value)
      return w ? [{ key: `${id}-${d.npc}`, points: w.points, color, active, pet: id, boss: BOSS_NPCS.has(d.npc) }] : []
    })
  return [
    ...needed.value.flatMap((id) => of(id, NEEDED, false)),
    ...tracked.value.filter((t) => !hidden.value.has(t.id)).flatMap((t) => of(t.id, t.color, true)),
  ]
})
const cubes = computed(() => (inZone.value && showCubes.value ? store.cubes.map((c) => c.position) : []))
const you = computed(() => (inZone.value ? store.nearby.position : null))

// "Find me": the map fits you, once (the map refits whenever focus changes).
const focus = ref<[number, number][]>([])
function findMe(): void {
  if (you.value) focus.value = [you.value]
}
watch(worldId, () => (focus.value = []))

</script>

<template>
  <div>
    <PageHeader title="Map" about="Where you are, the Hidden Cubes around you, and where the souls of the pets you are after drop.">
      <SelectBox v-if="zones.length && worldId !== null" :model-value="worldId" :options="zones" @update:model-value="picked = $event" />
      <Button :disabled="!you" @click="findMe">
        <svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="3" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" /></svg>
        {{ t('Find me') }}
      </Button>
    </PageHeader>

    <div class="mb-6 grid grid-cols-[15rem_1fr] gap-4">
      <aside class="space-y-4 rounded-xl border border-card bg-card p-3 text-sm">
        <div>
          <div class="mb-1.5 text-xs font-semibold uppercase tracking-wider text-darker">{{ t('Tracked pets') }}</div>
          <p v-if="!tracked.length" class="text-xs text-darker">{{ t('Pin pets on the Pets page, or get near their soul monsters, and their spawns show here.') }}</p>
          <button
            v-for="tp in tracked"
            :key="tp.id"
            type="button"
            :class="['flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-dark', hidden.has(tp.id) && 'opacity-40']"
            :title="hidden.has(tp.id) ? t('Show its spawns') : t('Hide its spawns')"
            @click="flip(tp.id)"
          >
            <span class="size-2.5 shrink-0 rounded-full" :style="{ background: tp.color }" />
            <PetIcon :id="tp.id" :size="20" />
            <span class="min-w-0 flex-1 truncate">{{ displayName(pet(tp.id)) }}</span>
            <span class="text-[10px] text-darkest">{{ tp.pinned ? t('pinned') : t('nearby') }}</span>
          </button>
        </div>
        <div class="space-y-2 border-t border-card pt-3">
          <label class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-2"><span class="size-2.5 rounded-full" :style="{ background: NEEDED }" />{{ t('Pets you still need') }}</span>
            <Toggle v-model="showNeeded" />
          </label>
          <label class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-2"><span class="size-2.5 rotate-45 bg-yellow" />Hidden Cubes</span>
            <Toggle v-model="showCubes" />
          </label>
          <label class="flex items-center justify-between gap-2" :title="t('The ones pinned on the Gatherables page, or all of them while none is')">
            <span class="flex items-center gap-2"><img :src="'gather/orichalcum-ore.webp'" alt="" class="size-3.5" />{{ t('Gatherables') }}</span>
            <Toggle v-model="showGather" />
          </label>
          <p v-if="showGather && !gatherCount" class="text-xs text-darkest">{{ t('No gatherables known in this zone yet.') }}</p>
          <p v-if="showNeeded" class="text-xs text-darkest">{{ plural(needed.length, '{n} more pet drops souls in this zone.', '{n} more pets drop souls in this zone.') }}</p>
        </div>
        <div class="border-t border-card pt-3 text-xs text-darker">
          <template v-if="inZone && you">{{ t('You are here: the blue ring.') }}</template>
          <template v-else-if="inZone">{{ t('You are in this zone; where exactly is not known yet.') }}</template>
          <template v-else-if="here !== null">{{ t('You are in {zone}.', { zone: spawns?.worlds[here]?.name ?? t('another zone') }) }}</template>
          <template v-else>{{ t('Where you are is not known yet: it is read as you enter a zone.') }}</template>
          <p v-if="death" class="mt-1">{{ t('The skull: where you last died.') }}</p>
        </div>
      </aside>
      <div class="h-[calc(100vh-15rem)] min-h-[420px] overflow-hidden rounded-xl border border-card">
        <WorldMap v-if="world" :world="world" :layers="layers" :focus="focus" :you="you" :cubes="cubes" :icons="icons" :death="death" />
        <div v-else class="flex h-full items-center justify-center text-sm text-darker">{{ t('Loading maps…') }}</div>
      </div>
    </div>

    <Section title="Hidden Cubes" icon="M8 1.8l5.5 3.1v6.2L8 14.2l-5.5-3.1V4.9zM2.5 4.9L8 8l5.5-3.1M8 8v6.2">
      <SettingRow label="Sound for a cube" hint="When one comes into view (the game tells you within about 100 m), whatever overlay is open.">
        <Toggle :model-value="store.settings.cubes.sound" @update:model-value="store.set('cubes', { ...store.settings.cubes, sound: $event })" />
      </SettingRow>
      <SoundPicker v-if="store.settings.cubes.sound" kind="cube" label="Cube sound" />
      <SettingRow label="On this map" hint="The cubes in view, as golden cubes (also the switch beside the map).">
        <Toggle v-model="showCubes" />
      </SettingRow>
      <p class="text-xs text-darker">{{ t('The Minimap always shows them; the Unified HUD and the Game Map Markers each have their own switch on the Overlays page.') }}</p>
    </Section>
  </div>
</template>
