<script setup lang="ts">
// The duty board's advice, as the dashboard's page and the window over the game show it: the
// missions to take for your free slots, and whether a reroll is worth its cost.
import { computed } from 'vue'
import { plural, t } from '@/lib/i18n.ts'
import { compact } from '@shared/format.ts'
import { dutyAdvice, type DutyState, type DutyValues } from '@shared/duty.ts'
import { questName } from '@shared/sessions.ts'

const props = defineProps<{ state: DutyState; values: DutyValues }>()
const advice = computed(() => dutyAdvice(props.state, props.values))
const kina = (n: number): string => compact(Math.round(n))
</script>

<template>
  <div v-if="advice" class="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
    <template v-if="!advice.free">{{ t('Your 5 missions are taken today.') }}</template>
    <template v-else>
      <div v-if="advice.picks.length">
        {{ plural(advice.picks.length, 'Take this one:', 'Take these {n}:') }}
        <span class="font-semibold">{{ advice.picks.map(questName).join(', ') }}</span>
        <span class="text-darker"> · {{ t('worth {kina} Kina on average', { kina: kina(advice.value) }) }}</span>
      </div>
      <div v-else-if="advice.reroll !== true">{{ t('Nothing on this board is worth anything to you: reroll it, or change what each reward is worth below.') }}</div>
      <div class="mt-1">
        <span v-if="advice.newBoard === null" class="text-darker">{{ t('Not enough boards seen yet to tell what a reroll is worth ({n} of 3).', { n: state.history.length }) }}</span>
        <!-- The best way: take these, then reroll for the slots left; or take them and keep the board. -->
        <template v-else-if="advice.reroll === true">
          <span class="font-semibold text-green">{{ advice.picks.length ? t('Then reroll for {cost} Kina', { cost: kina(advice.nextCost!) }) : t('Reroll it all for {cost} Kina', { cost: kina(advice.nextCost!) }) }}</span>
          {{ t('for the {n} slots left: {kina} expected in all, {more} more than taking {free} now.', { n: advice.free - advice.picks.length, kina: kina(advice.expected), more: kina(advice.expected - advice.takeAll), free: advice.free }) }}
        </template>
        <template v-else-if="advice.reroll === false">
          <span class="font-semibold">{{ t('Keep this board:') }}</span>
          {{ t('a reroll costs {cost} Kina, a new board is worth {kina} on average.', { cost: kina(advice.nextCost!), kina: kina(advice.newBoard) }) }}
        </template>
        <template v-else>
          {{ t('A reroll pays if it costs less than {gain} Kina (a new board: {kina} on average).', { gain: kina(Math.max(0, advice.newBoard - advice.value)), kina: kina(advice.newBoard) }) }}
        </template>
      </div>
    </template>
  </div>
</template>
