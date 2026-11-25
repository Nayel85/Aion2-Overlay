<script setup lang="ts">
// The Overlays page: every overlay on the left (lib/overlayList.ts), on or off at a glance; the one
// picked on the right, with all its settings (what it shows, then its window: opacity, size, idle,
// position). Home's ⚙ opens it on the right one.
import { computed, type Component } from 'vue'
import { t } from '@/lib/i18n.ts'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useOverlayList, type OverlayEntryId } from '@/lib/overlayList.ts'
import ApplicantsView from '@/components/dashboard/ApplicantsView.vue'
import BuffsView from '@/components/dashboard/BuffsView.vue'
import FlightView from '@/components/dashboard/FlightView.vue'
import GatherView from '@/components/dashboard/GatherView.vue'
import MapV2View from '@/components/dashboard/MapV2View.vue'
import MeterView from '@/components/dashboard/MeterView.vue'
import PartyView from '@/components/dashboard/PartyView.vue'
import UnifiedView from '@/components/dashboard/UnifiedView.vue'
import CcSettings from '@/components/overlays/CcSettings.vue'
import DutySettings from '@/components/overlays/DutySettings.vue'
import EnemiesSettings from '@/components/overlays/EnemiesSettings.vue'
import AggroSettings from '@/components/overlays/AggroSettings.vue'
import EventBarSettings from '@/components/overlays/EventBarSettings.vue'
import KillFeedSettings from '@/components/overlays/KillFeedSettings.vue'
import MerchantSettings from '@/components/overlays/MerchantSettings.vue'
import MinimapSettings from '@/components/overlays/MinimapSettings.vue'
import SkillsSettings from '@/components/overlays/SkillsSettings.vue'
import SoulTrackerSettings from '@/components/overlays/SoulTrackerSettings.vue'
import TrainingSettings from '@/components/overlays/TrainingSettings.vue'

const picked = defineModel<OverlayEntryId>({ default: 'unified' })
const list = useOverlayList()

/** Each one's settings; `own`: a page of its own, with its title (the others get theirs here). */
const SETTINGS: Record<OverlayEntryId, { component: Component; own?: boolean }> = {
  unified: { component: UnifiedView, own: true },
  meter: { component: MeterView, own: true },
  skills: { component: SkillsSettings },
  party: { component: PartyView, own: true },
  buffs: { component: BuffsView, own: true },
  cc: { component: CcSettings },
  flight: { component: FlightView, own: true },
  gather: { component: GatherView, own: true },
  applicants: { component: ApplicantsView, own: true },
  hud: { component: SoulTrackerSettings },
  minimap: { component: MinimapSettings },
  gameMap: { component: MapV2View, own: true },
  timerbar: { component: EventBarSettings },
  killfeed: { component: KillFeedSettings },
  enemies: { component: EnemiesSettings },
  aggro: { component: AggroSettings },
  training: { component: TrainingSettings },
  merchant: { component: MerchantSettings },
  duty: { component: DutySettings },
}
const current = computed(() => list.value.find((o) => o.id === picked.value) ?? list.value[0]!)
</script>

<template>
  <div class="flex gap-5">
    <!-- Every overlay, on or off. -->
    <nav class="sticky top-0 w-56 shrink-0 self-start">
      <div class="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-darker">{{ t('Overlays') }}</div>
      <ul class="space-y-0.5">
        <li v-for="o in list" :key="o.id">
          <button
            type="button"
            :class="['flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition', o.id === current.id ? 'bg-accent/15 text-default' : 'text-dark hover:bg-card hover:text-default']"
            @click="picked = o.id"
          >
            <span :class="['size-2 shrink-0 rounded-full', o.on ? 'bg-green' : 'border border-light']" :title="o.on ? t('On') : t('Off')" />
            <span class="truncate">{{ o.name }}</span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- The one picked: its settings. -->
    <div class="min-w-0 flex-1">
      <template v-if="!SETTINGS[current.id].own">
        <PageHeader :title="current.name" :about="current.about" />
      </template>
      <component :is="SETTINGS[current.id].component" :key="current.id" />
    </div>
  </div>
</template>
