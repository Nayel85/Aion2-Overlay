<script setup lang="ts">
// The character playing's session, since their login (or the last Reset): who, since when and for how
// long; its totals in one line (Kina and Abyss Points earned, runs and their gold loot); under it, all
// of it as the Past sessions page shows a session (SessionDetail, the latest first), and beside it its
// souls by pet (their total in the box's title) and a way to the past sessions. The rates per hour are
// the Unified HUD's; the engine's state is in Settings.
import CharName from '@/components/CharName.vue'
import { useNow } from '@/lib/now.ts'
import { computed, ref } from 'vue'
import GenusPill from '@/components/GenusPill.vue'
import LevelBadge from '@/components/LevelBadge.vue'
import PetIcon from '@/components/PetIcon.vue'
import { ICON, LOOT_KIND_STYLE } from '@/components/panel/sessionIcons.ts'
import SessionDetail from '@/components/sessions/SessionDetail.vue'
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
const current = computed(() => store.sessions.current)
const runs = computed(() => (current.value ? countedRuns(current.value) : []))
const counts = computed(() => lootCounts(runs.value))
const clock = (ms: number): string => new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' })
/** How long it has gone on, kept current: "1 h 24 min". */
const now = useNow(30_000)
const lasted = computed(() => {
  const min = current.value ? Math.max(0, Math.floor((now.value - current.value.start) / 60_000)) : 0
  return min < 60 ? t('{n} min', { n: min }) : t('{h} h {m} min', { h: Math.floor(min / 60), m: min % 60 })
})

</script>

<template>
  <div class="space-y-3 p-3">
    <div class="flex items-center justify-between text-xs">
      <span class="font-medium text-darker">
        {{ t('This session') }}<template v-if="current"> · <CharName :name="current.name" class="text-dark" />, {{ t('since {time}', { time: clock(current.start) }) }} · {{ lasted }}</template>
      </span>
      <button
        type="button"
        :class="[
          'rounded-md border px-2 py-0.5 transition',
          confirming ? 'border-danger/50 bg-danger/10 text-danger' : 'border-light text-darker hover:text-dark',
        ]"
        :title="t('This session goes to the past ones and a new one starts now (your collection is not changed)')"
        @click="resetSession"
      >
        {{ confirming ? t('Click again to reset') : t('Reset session') }}
      </button>
    </div>

    <!-- Its totals. -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-card px-4 py-3 text-sm tabular-nums">
      <span :title="t('Every Kina this session gave: farming, rewards, dungeons')">
        <span class="text-lg font-semibold text-yellow">{{ formatKina(store.kina.earned) }}</span> <span class="text-xs text-darker">Kina</span>
      </span>
      <span :title="t('Every Abyss Point this session gave')">
        <span class="text-lg font-semibold text-blue">{{ formatAmount(store.abyss.earned) }}</span> <span class="text-xs text-darker">AP</span>
        <span v-if="store.abyss.points !== null && store.abyss.limit" class="ml-1 text-xs text-darker">· {{ t('{points} of {limit} this week', { points: formatAmount(store.abyss.points), limit: formatAmount(store.abyss.limit) }) }}</span>
      </span>
      <span>
        <span class="text-lg font-semibold">{{ runs.length }}</span> <span class="text-xs text-darker">{{ plural(runs.length, 'run', 'runs') }}</span>
      </span>
      <span class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <template v-for="k in LOOT_KINDS" :key="k.key">
          <span v-if="counts[k.key]" :class="['flex items-center gap-1 font-semibold', LOOT_KIND_STYLE[k.key]!.class]" :title="t(k.label)"><svg viewBox="0 0 16 16" class="size-3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="LOOT_KIND_STYLE[k.key]!.icon" /></svg>{{ counts[k.key] }}</span>
        </template>
      </span>
    </div>

    <div class="grid items-start gap-3 lg:grid-cols-[3fr_2fr]">
      <!-- All of it, the latest first. -->
      <div class="rounded-lg border border-card p-4">
        <SessionDetail v-if="current" :session="current" live :header="false" />
        <p v-else class="py-4 text-center text-sm text-darker">{{ t('No session yet: log in with a character.') }}</p>
      </div>

      <div class="space-y-3">
        <div class="rounded-lg border border-card bg-card">
        <div class="flex items-baseline gap-2 border-b border-card px-3 py-2 text-xs">
          <span class="font-medium text-darker">{{ t('Souls') }}</span>
          <span class="text-lg font-semibold tabular-nums text-accent">{{ store.sessionSouls }}</span>
          <span v-if="gained.length" class="text-darker">{{ plural(gained.length, 'on {n} pet', 'on {n} pets') }}</span>
        </div>
        <ul v-if="gained.length" class="divide-y divide-[color:var(--line)]">
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
        <p v-else class="py-4 text-center text-sm text-darker">{{ t('No souls yet this session.') }}</p>
        </div>

        <!-- The past sessions have their own page. -->
        <button v-if="store.sessions.history.length" type="button" class="flex w-full items-center gap-2 rounded-lg border border-card px-3 py-2 text-left text-xs hover:bg-card" @click="emit('history')">
          <svg viewBox="0 0 16 16" class="size-3.5 text-darker" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.day" /></svg>
          <span class="font-medium">{{ t('Past sessions') }}</span>
          <span class="text-darker">· {{ plural(store.sessions.history.length, '{n} session', '{n} sessions') }}</span>
          <svg viewBox="0 0 16 16" class="ml-auto size-3 text-darker" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path :d="ICON.chevron" /></svg>
        </button>
      </div>
    </div>
  </div>
</template>
