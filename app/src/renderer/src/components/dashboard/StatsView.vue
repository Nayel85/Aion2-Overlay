<script setup lang="ts">
// The stats, in one page: the dungeons' loot (LootView), the crafts (CraftsView) and the gathering
// (GatherStatsView), each with its filters. By default the counts, your rates and the game's; with
// Details, what the game's rates make expected, your luck and the rest. The tab picked and Details
// are remembered (this window's storage).
import { useStored } from '@/lib/now.ts'
import CraftsView from '@/components/dashboard/CraftsView.vue'
import GatherStatsView from '@/components/dashboard/GatherStatsView.vue'
import LootView from '@/components/dashboard/LootView.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import Toggle from '@/components/Toggle.vue'
import { t } from '@/lib/i18n.ts'

type Tab = 'loot' | 'crafts' | 'gathering'
const TABS: { id: Tab; label: string }[] = [
  { id: 'loot', label: 'Loot' },
  { id: 'crafts', label: 'Crafts' },
  { id: 'gathering', label: 'Gathering' },
]
/** The tab and Details, remembered in this window's storage. */
const tab = useStored<Tab>('stats.tab', 'loot', (raw) => (TABS.some((x) => x.id === raw) ? (raw as Tab) : 'loot'))
const details = useStored('stats.details', false, (raw) => raw === true || raw === 1)
</script>

<template>
  <div>
    <PageHeader title="Stats" about="Your dungeons' loot, your crafts and your gathering over the sessions kept, each with its filters." />
    <div class="mb-4 flex items-center gap-3">
      <Segmented v-model="tab" :options="TABS" />
      <label class="ml-auto flex cursor-pointer items-center gap-2 text-xs text-dark" :title="t('What the game\'s rates make expected, your luck, and the rest')">
        {{ t('Details') }}<Toggle v-model="details" />
      </label>
    </div>
    <LootView v-if="tab === 'loot'" embedded :details="details" />
    <CraftsView v-else-if="tab === 'crafts'" embedded :details="details" />
    <GatherStatsView v-else :details="details" />
  </div>
</template>
