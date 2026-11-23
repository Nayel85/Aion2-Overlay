<script setup lang="ts">
// The stats, in one page: the dungeons' loot (LootView), the crafts (CraftsView) and the gathering
// (GatherStatsView), each with its filters. The tab picked is remembered (this window's storage).
import { ref, watch } from 'vue'
import CraftsView from '@/components/dashboard/CraftsView.vue'
import GatherStatsView from '@/components/dashboard/GatherStatsView.vue'
import LootView from '@/components/dashboard/LootView.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'

type Tab = 'loot' | 'crafts' | 'gathering'
const TABS: { id: Tab; label: string }[] = [
  { id: 'loot', label: 'Loot' },
  { id: 'crafts', label: 'Crafts' },
  { id: 'gathering', label: 'Gathering' },
]
const STORAGE_KEY = 'stats.tab'
function savedTab(): Tab {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return TABS.some((x) => x.id === v) ? (v as Tab) : 'loot'
  } catch {
    return 'loot'
  }
}
const tab = ref<Tab>(savedTab())
watch(tab, (v) => {
  try {
    localStorage.setItem(STORAGE_KEY, v)
  } catch {
    // Storage unavailable: the tab is only for this time.
  }
})
</script>

<template>
  <div>
    <PageHeader title="Stats" about="Your dungeons' loot, your crafts and your gathering over the sessions kept, each with its filters." />
    <Segmented v-model="tab" class="mb-4" :options="TABS" />
    <LootView v-if="tab === 'loot'" embedded />
    <CraftsView v-else-if="tab === 'crafts'" embedded />
    <GatherStatsView v-else />
  </div>
</template>
