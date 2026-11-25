<script setup lang="ts">
// The in-game overlay. Click-through, and exactly as big as what it shows: it measures itself and
// main sizes the window to fit (an empty HUD is a hidden window). In edit mode it takes the mouse
// so it can be dragged; Escape or Done ends that.
import { useOverlay } from '@/lib/overlay.ts'
import { computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { HUD_PINNED_ROWS } from '@shared/settings.ts'
import GenusPill from '@/components/GenusPill.vue'
import LevelBadge from '@/components/LevelBadge.vue'
import LevelBar from '@/components/LevelBar.vue'
import PetIcon from '@/components/PetIcon.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { displayName, GENUS_LABEL, petInfo } from '@/lib/petDb.ts'
import { nearbyPets, useSpawns, type NearbyPet } from '@/lib/spawns.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import { blankPet, nextLevelSouls, type Pet } from '@shared/tracker.ts'

const store = useApp()
// Measured, shown and placed as every overlay (lib/overlay.ts).
const { report } = useOverlay('hud')
const hud = computed(() => store.settings.hud)

const spawns = useSpawns()
/** How many of each pet's soul monsters are around you (nearby mode). */
const near = computed(
  () =>
    new Map<number, NearbyPet>(
      (spawns.value ? nearbyPets(store.nearby, spawns.value) : []).filter((n) => !store.hiddenPet(n.pet)).map((n) => [n.pet, n]),
    ),
)
/** In nearby mode a row is named by the monsters around you, not the pet whose souls they drop. */
const monsterLabel = (pet: number): string =>
  (near.value.get(pet)?.monsters ?? []).map((m) => `${m.name}${m.count > 1 ? ` ×${m.count}` : ''}`).join(', ')

/** Top section: the pets whose soul monsters are around you (a pet with no souls yet included). */
const nearRows = computed<Pet[]>(() => {
  if (!hud.value.nearby) return []
  const known = new Map(store.pets.map((p) => [p.id, p]))
  return [...near.value.keys()]
    .slice(0, hud.value.nearbyCount)
    .map((id) => known.get(id) ?? blankPet(id))
})

/**
 * Middle section: this fight's pets, or the pinned ones. A pet the Nearby section shows already is
 * left out (it was listed twice), and the next one takes its row.
 */
const pinnedRows = computed<Pet[]>(() => {
  const shown = new Set(nearRows.value.map((p) => p.id))
  return hud.value.pinned.map((id) => store.pets.find((p) => p.id === id)).filter((p): p is Pet => !!p && !shown.has(p.id))
})
const listed = computed<Pet[]>(() => {
  const shown = new Set(nearRows.value.map((p) => p.id))
  return hud.value.mode === 'pinned'
    ? pinnedRows.value.slice(0, HUD_PINNED_ROWS)
    : store.recentPets.filter((p) => !shown.has(p.id)).slice(0, hud.value.recentCount)
})
/**
 * Nothing to list while it is being placed: a sample to place it by, as every overlay has (your
 * own pets still to level, as many rows as it lists).
 */
const rows = computed<Pet[]>(() =>
  listed.value.length || nearRows.value.length || !store.hudEditing
    ? listed.value
    : store.pets.filter((p) => nextLevelSouls(p) !== null).slice(0, hud.value.mode === 'pinned' ? 3 : hud.value.recentCount),
)
/** Pinned pets past the HUD's rows: counted under them. */
const morePinned = computed(() => (hud.value.mode === 'pinned' ? pinnedRows.value.length - listed.value.length : 0))
const toasts = computed(() => (hud.value.toasts ? store.toasts : []))
/** The count towards the next level, against what it needs: 0/5 at Lv0, 5/25 at Lv1, 9/75 at Lv2. */
const progressText = (pet: Pet): string => {
  const need = nextLevelSouls(pet)
  return need === null ? 'max' : `${pet.souls}/${need}`
}
/** "Fera crystal": a maxed pet's drop is its genus's crystal. */
const crystalLabel = (pet: number): string => {
  const genus = petInfo(pet)?.genus
  return genus ? t('{genus} crystal', { genus: GENUS_LABEL[genus] }) : t('crystal')
}

/** Between fights (idle timeout): nothing to show, so the HUD hides; pinned pets included. */
const resting = computed(() => !!hud.value.idleHideSeconds && !store.fighting)
/** No game traffic for a while, with "Hide without game traffic" on: nothing shown (main hides it at 0 × 0). */
const noGame = computed(() => hud.value.hideWithoutGame && !(store.status?.gameActive || store.status?.replay))
const empty = computed(
  () =>
    noGame.value ||
    resting.value ||
    (nearRows.value.length === 0 && rows.value.length === 0 && toasts.value.length === 0),
)

const drag = windowDrag({ overlay: 'hud' })
const done = (): void => void bridge().invoke('hud:setEditing', false)
const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Escape' && store.hudEditing) done()
}

/** Tell main how big the HUD is: main sizes the window to it, and shows or hides it. */

// A hidden window does not run ResizeObserver (Chromium pauses rendering there), and the HUD is
// hidden exactly while it is empty: the first soul would never show it. So it also measures
// itself after every change to what it shows, which works hidden or not.
watch([nearRows, rows, toasts, resting, noGame, () => store.hudEditing, () => hud.value.scale, () => store.nearby], () => void nextTick(report), { deep: true })

onMounted(() => {
  window.addEventListener('keydown', onKey)
  report()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block" :style="{ zoom: hud.scale }">
      <div
        v-if="!empty || store.hudEditing"
        :class="[
          'm-1.5 w-80 rounded-lg border bg-darker/90 p-2.5 shadow-card',
          store.hudEditing ? 'cursor-move border-dashed border-accent' : 'border-card',
        ]"
        :style="{ opacity: store.hudEditing ? 1 : hud.opacity }"
        @pointerdown="store.hudEditing && drag.onPointerDown($event)"
      >
        <div v-if="store.hudEditing" class="mb-2 flex items-center justify-between gap-2 text-xs">
          <span class="text-accent">{{ t('Drag to move the HUD') }}</span>
          <button
            type="button"
            class="rounded bg-accent px-2 py-0.5 font-semibold text-white"
            @pointerdown.stop
            @click="done"
          >
            {{ t('Done') }}
          </button>
        </div>


        <div v-if="nearRows.length" class="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          <span class="size-1.5 rounded-full bg-green" /><span class="text-green">{{ t('Nearby') }}</span>
        </div>
        <section v-if="nearRows.length">
          <div class="space-y-2">
            <div v-for="pet in nearRows" :key="pet.id" class="flex items-center gap-2">
              <PetIcon :id="pet.id" :size="30" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2 text-[13px]">
                  <span class="truncate font-medium text-dark">{{ monsterLabel(pet.id) }}</span>
                  <span class="flex shrink-0 items-center gap-1.5 tabular-nums">
                    <span v-if="pet.session" class="text-xs text-green">+{{ pet.session }}</span>
                    <span class="font-semibold">{{ progressText(pet) }}</span>
                    <LevelBadge :pet="pet" />
                  </span>
                </div>
                <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-darker">
                  <span class="truncate">{{ displayName(pet) }} pet</span>
                  <GenusPill :id="pet.id" />
                </div>
                <LevelBar :pet="pet" thin class="mt-1" />
              </div>
            </div>
          </div>
        </section>

        <section v-if="rows.length" :class="nearRows.length ? 'mt-2.5 border-t border-card pt-2.5' : ''">
          <div class="space-y-2">
            <div v-for="pet in rows" :key="pet.id" class="flex items-center gap-2">
              <PetIcon :id="pet.id" :size="30" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-2 text-[13px]">
                  <span class="flex min-w-0 items-center gap-1.5">
                    <span class="truncate font-medium text-dark">{{ displayName(pet) }}</span>
                    <GenusPill :id="pet.id" />
                  </span>
                  <span class="flex shrink-0 items-center gap-1.5 tabular-nums">
                    <span v-if="pet.session" class="text-xs text-green">+{{ pet.session }}</span>
                    <span class="font-semibold">{{ progressText(pet) }}</span>
                    <LevelBadge :pet="pet" />
                  </span>
                </div>
                <LevelBar :pet="pet" thin class="mt-1" />
              </div>
            </div>
          </div>
          <div v-if="morePinned > 0" class="mt-1.5 text-center text-[11px] text-darker">… {{ t('{n} more pinned', { n: morePinned }) }}</div>
        </section>

        <p v-if="store.hudEditing && !nearRows.length && !rows.length" class="text-xs text-darker">
          {{
            hud.mode === 'pinned'
              ? t('Nothing nearby, and no pinned pets: pin some on the Pets page.')
              : t('Soul monsters around you, and pets you gain souls for, show up here.')
          }}
        </p>

        <TransitionGroup
          v-if="toasts.length"
          tag="div"
          name="toast"
          :class="['space-y-1', (nearRows.length || rows.length) && 'mt-2.5 border-t border-card pt-2']"
        >
          <div v-for="toast in toasts" :key="toast.at + '-' + toast.pet.id" class="flex items-center gap-2 text-xs">
            <span :class="['font-bold', toast.crystal ? 'text-yellow' : 'text-accent']">+{{ toast.amount }}</span>
            <PetIcon :id="toast.pet.id" :size="18" />
            <span class="truncate">{{ displayName(toast.pet) }}<span v-if="toast.crystal" class="text-yellow"> · {{ crystalLabel(toast.pet.id) }}</span></span>
            <span v-if="toast.levelUp" class="shrink-0 rounded bg-green/20 px-1 text-[10px] font-bold text-green">Lv{{ toast.pet.level }}!</span>
            <span class="ml-auto tabular-nums text-darker">{{ toast.crystal ? toast.pet.crystals : progressText(toast.pet) }}</span>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 300ms ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.toast-leave-to {
  opacity: 0;
}
</style>
