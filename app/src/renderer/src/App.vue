<script setup lang="ts">
// One renderer, many windows: the hash says which one this is. Read once, from location rather
// than a router, so a window never flashes another window's page (a marnis-app lesson). Each page is
// loaded on its own, so a small overlay does not load the dashboard's code and tables.
import { defineAsyncComponent, onMounted, type Component } from 'vue'
import { useApp } from './stores/app.ts'

const PAGES: Record<string, () => Promise<{ default: Component }>> = {
  bossruns: () => import('./pages/BossRunsPage.vue'),
  applicants: () => import('./pages/ApplicantsPage.vue'),
  party: () => import('./pages/PartyPage.vue'),
  flight: () => import('./pages/FlightPage.vue'),
  gather: () => import('./pages/GatherPage.vue'),
  eventtoast: () => import('./pages/EventToastPage.vue'),
  bubble: () => import('./pages/BubblePage.vue'),
  buffs: () => import('./pages/BuffsPage.vue'),
  cc: () => import('./pages/CcPage.vue'),
  enemies: () => import('./pages/EnemiesPage.vue'),
  training: () => import('./pages/TrainingPage.vue'),
  details: () => import('./pages/DetailsPage.vue'),
  gamemap: () => import('./pages/GameMapPage.vue'),
  regionpick: () => import('./pages/RegionPickPage.vue'),
  hud: () => import('./pages/HudPage.vue'),
  killfeed: () => import('./pages/KillFeedPage.vue'),
  merchant: () => import('./pages/MerchantPage.vue'),
  meter: () => import('./pages/MeterPage.vue'),
  minimap: () => import('./pages/MiniMapPage.vue'),
  skills: () => import('./pages/SkillsPage.vue'),
  timerbar: () => import('./pages/TimerBarPage.vue'),
  unified: () => import('./pages/UnifiedPage.vue'),
  packets: () => import('./pages/PacketsPage.vue'),
  panel: () => import('./pages/PanelPage.vue'),
}
const page = location.hash.replace(/^#\/?/, '') || 'panel'
const Page = defineAsyncComponent(PAGES[page] ?? PAGES['panel']!)
const store = useApp()
onMounted(() => void store.init())
</script>

<template>
  <component :is="Page" />
</template>
