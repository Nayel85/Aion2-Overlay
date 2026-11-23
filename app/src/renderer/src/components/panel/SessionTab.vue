<script setup lang="ts">
// The character playing's session, since their login: on top its rates (Kina and Abyss Points an
// hour, with their timelines), its souls and its runs; under it, all of it as the Past sessions page
// shows a session (SessionDetail, the latest first), and beside it the souls per pet, a way to the
// past sessions, and what the tracker sees of the game.
import { computed, ref } from 'vue'
import GenusPill from '@/components/GenusPill.vue'
import LevelBadge from '@/components/LevelBadge.vue'
import PetIcon from '@/components/PetIcon.vue'
import { ICON, LOOT_KIND_STYLE } from '@/components/panel/sessionIcons.ts'
import SessionDetail from '@/components/sessions/SessionDetail.vue'
import Sparkline from '@/components/Sparkline.vue'
import StatusDot, { statusText } from '@/components/StatusDot.vue'
import { bridge } from '@/lib/bridge.ts'
import { loc, plural, t } from '@/lib/i18n.ts'
import { displayName } from '@/lib/petDb.ts'
import { formatKina } from '@shared/kina.ts'
import { formatAmount } from '@shared/earnings.ts'
import { countedRuns, LOOT_KINDS, lootCounts } from '@shared/sessions.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const emit = defineEmits<{ history: [] }>()
const gained = computed(() => store.pets.filter((p) => p.session > 0).sort((a, b) => b.session - a.session))
/** Reset asks once: the first click arms it for 3 seconds, the second resets. */
const confirming = ref(false)
let confirmTimer: ReturnType<typeof setTimeout> | null = null
function resetSession(): void {
  if (confirmTimer) clearTimeout(confirmTimer)
  if (!confirming.value) {
    confirming.value = true
    confirmTimer = setTimeout(() => (confirming.value = false), 3000)
    return
  }
  confirming.value = false
  void bridge().invoke('tracker:resetSession')
}
/** "14:32 · 48.2k/h": a point of the timeline, on hover. */
const kinaPointLabel = (i: number): string => {
  const p = store.kinaTimeline[i]
  if (!p) return ''
  const at = new Date(p.at).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  return `${at} · ${formatKina(p.perHour)}/h`
}
const abyssPointLabel = (i: number): string => {
  const p = store.abyssTimeline[i]
  if (!p) return ''
  const at = new Date(p.at).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
  return `${at} · ${formatAmount(p.perHour)}/h`
}
const current = computed(() => store.sessions.current)
const runs = computed(() => (current.value ? countedRuns(current.value) : []))
const counts = computed(() => lootCounts(runs.value))
const clock = (ms: number): string => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })

const lastPacket = computed(() => {
  const ago = store.status?.lastPacketAgo
  return ago === null || ago === undefined ? t('never') : ago < 5 ? t('just now') : t('{n} s ago', { n: Math.round(ago) })
})
</script>

<template>
  <div class="space-y-3 p-3">
    <div class="flex items-center justify-between text-xs">
      <span class="font-medium text-darker">
        {{ t('This session') }}<template v-if="current"> · <span class="text-dark">{{ current.name }}</span>, {{ t('since {time}', { time: clock(current.start) }) }}</template>
      </span>
      <button
        type="button"
        :class="[
          'rounded-md border px-2 py-0.5 transition',
          confirming ? 'border-danger/50 bg-danger/10 text-danger' : 'border-light text-darker hover:text-dark',
        ]"
        :title="t('Start the session\'s souls, Kina and Abyss Points again (your collection is not changed)')"
        @click="resetSession"
      >
        {{ confirming ? t('Click again to reset') : t('Reset session') }}
      </button>
    </div>

    <!-- Its rates, souls and runs. -->
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div class="rounded-lg bg-card p-3 text-center">
        <div
          v-if="store.kinaRate !== null"
          :title="t('Kina earned per hour of farming: gains only (spending is not taken off), and a break of more than 5 minutes counts as 5.')"
          class="text-3xl font-semibold tabular-nums text-yellow">{{ formatKina(store.kinaRate) }}</div>
        <!-- Kina is coming in, but under a minute of it: no rate yet. -->
        <div v-else-if="store.kina.earned" class="flex h-9 items-center justify-center text-lg font-semibold text-yellow">{{ t('measuring…') }}</div>
        <div v-else class="text-3xl font-semibold text-yellow">—</div>
        <div class="text-xs text-darker">
          <template v-if="store.kina.earned">{{ t('Kina per hour, {kina} earned', { kina: formatKina(store.kina.earned) }) }}</template>
          <template v-else>{{ t('Kina per hour, from your first loot') }}</template>
        </div>
        <Sparkline v-if="store.kinaTimeline.length" :values="store.kinaTimeline.map((p) => p.perHour)" :label="kinaPointLabel" class="mt-2 h-8 text-yellow" />
      </div>
      <div class="rounded-lg bg-card p-3 text-center">
        <div
          v-if="store.abyssRate !== null"
          :title="t('Abyss Points earned per hour: a break of more than 5 minutes counts as 5.')"
          class="text-3xl font-semibold tabular-nums text-blue">{{ formatAmount(store.abyssRate) }}</div>
        <div v-else-if="store.abyss.earned" class="flex h-9 items-center justify-center text-lg font-semibold text-blue">{{ t('measuring…') }}</div>
        <div v-else class="text-3xl font-semibold text-blue">—</div>
        <div class="text-xs text-darker">
          <template v-if="store.abyss.earned">{{ t('Abyss Points per hour, {n} earned', { n: formatAmount(store.abyss.earned) }) }}</template>
          <template v-else>{{ t('Abyss Points per hour, from your first gain') }}</template>
          <template v-if="store.abyss.points !== null && store.abyss.limit">
            · {{ t('{points} of {limit} this week', { points: formatAmount(store.abyss.points), limit: formatAmount(store.abyss.limit) }) }}
          </template>
        </div>
        <Sparkline v-if="store.abyssTimeline.length" :values="store.abyssTimeline.map((p) => p.perHour)" :label="abyssPointLabel" class="mt-2 h-8 text-blue" />
      </div>
      <div class="rounded-lg bg-card p-3 text-center">
        <div class="text-3xl font-semibold tabular-nums text-accent">{{ store.sessionSouls }}</div>
        <div class="text-xs text-darker">{{ plural(gained.length, 'souls this session, across {n} pet', 'souls this session, across {n} pets') }}</div>
      </div>
      <div class="rounded-lg bg-card p-3 text-center">
        <div class="text-3xl font-semibold tabular-nums">{{ runs.length }}</div>
        <div class="text-xs text-darker">{{ plural(runs.length, 'run this session', 'runs this session') }}</div>
        <div class="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <template v-for="k in LOOT_KINDS" :key="k.key">
            <span v-if="counts[k.key]" :class="['flex items-center gap-1 font-semibold', LOOT_KIND_STYLE[k.key]!.class]" :title="t(k.label)"><svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ counts[k.key] }}</span>
          </template>
        </div>
      </div>
    </div>

    <div class="grid items-start gap-3 lg:grid-cols-[3fr_2fr]">
      <!-- All of it, the latest first. -->
      <div class="rounded-lg border border-card p-4">
        <SessionDetail v-if="current" :session="current" live :header="false" />
        <p v-else class="py-4 text-center text-sm text-darker">{{ t('No session yet: log in with a character.') }}</p>
      </div>

      <div class="space-y-3">
        <ul v-if="gained.length" class="divide-y divide-[color:var(--line)] rounded-lg border border-card bg-card">
          <li
            v-for="pet in gained"
            :key="pet.id"
            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-dark"
            :title="t('Show where its souls drop')"
            @click="store.openPet(pet.id)"
          >
            <PetIcon :id="pet.id" :size="28" />
            <span class="flex min-w-0 flex-1 items-center gap-1.5">
              <span class="truncate">{{ displayName(pet) }}</span>
              <GenusPill :id="pet.id" />
            </span>
            <span class="tabular-nums text-green">+{{ pet.session }}</span>
            <span class="w-10 text-right font-semibold tabular-nums">{{ pet.souls }}</span>
            <LevelBadge :pet="pet" />
          </li>
        </ul>
        <p v-else class="rounded-lg border border-card py-4 text-center text-sm text-darker">{{ t('No souls yet this session.') }}</p>

        <!-- The past sessions have their own page. -->
        <button v-if="store.sessions.history.length" type="button" class="flex w-full items-center gap-2 rounded-lg border border-card px-3 py-2 text-left text-xs hover:bg-card" @click="emit('history')">
          <svg viewBox="0 0 16 16" class="size-3.5 text-darker" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.day" /></svg>
          <span class="font-medium">{{ t('Past sessions') }}</span>
          <span class="text-darker">· {{ plural(store.sessions.history.length, '{n} session', '{n} sessions') }}</span>
          <svg viewBox="0 0 16 16" class="ml-auto size-3 text-darker" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
        </button>

        <div class="space-y-1.5 rounded-lg border border-card p-3 text-xs">
          <div class="flex items-center gap-2 font-medium">
            <StatusDot :status="store.status" /> {{ statusText(store.status) }}
          </div>
          <div v-if="store.status?.detail" class="break-words text-darker">{{ store.status.detail }}</div>
          <div class="text-darker">{{ t('Last game packet: {when}', { when: lastPacket }) }}</div>
          <div v-if="store.status?.replay" class="text-yellow">{{ t('Replaying a saved capture (A2T_REPLAY): counts are not saved.') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
