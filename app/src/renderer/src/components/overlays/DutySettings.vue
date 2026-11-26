<script setup lang="ts">
// The Duty Board window: the board's advice over the game as you open it (pages/DutyPage.vue); what
// each reward is worth to you is on the Duty Board page. Opened again, the board sends nothing: the
// Journal's Duty tab is learned once, to be seen on the screen (main/dutyScreen.ts).
import { computed, onMounted, ref } from 'vue'
import OverlayWindowSettings from '@/components/OverlayWindowSettings.vue'
import SettingRow from '@/components/SettingRow.vue'
import Toggle from '@/components/Toggle.vue'
import Section from '@/components/ui/Section.vue'
import { bridge } from '@/lib/bridge.ts'
import { dateTime } from '@/lib/format.ts'
import { t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'

const store = useApp()
const cfg = computed(() => store.settings.duty)
const set = (patch: Partial<typeof cfg.value>): void => void store.set('duty', { ...cfg.value, ...patch })

const learned = ref<number | null>(null)
const learning = ref(false)
const failed = ref(false)
onMounted(async () => (learned.value = await bridge().invoke('duty:screenLearned')))
async function learn(): Promise<void> {
  learning.value = true
  failed.value = false
  const got = await bridge().invoke('duty:learnScreen')
  learning.value = false
  failed.value = !got.ok
  learned.value = await bridge().invoke('duty:screenLearned')
}
async function forget(): Promise<void> {
  await bridge().invoke('duty:forgetScreen')
  learned.value = null
}
</script>

<template>
  <Section bare>
    <SettingRow label="Show as you open the board" hint="As you open the duty board in game, reroll it or take a mission, its advice shows over the game; it closes as you move, fight or close the board, or with its X.">
      <Toggle :model-value="cfg.overlay" @update:model-value="set({ overlay: $event })" />
    </SettingRow>
    <SettingRow
      label="The Journal's Duty tab"
      hint="Opened again, the board sends nothing the app can read: it looks for the Journal's Duty tab on the screen instead. Click Learn, go back to the game and open the Journal on Duty (Mission) within 15 seconds."
    >
      <div class="flex items-center gap-2">
        <span v-if="learning" class="text-xs text-accent">{{ t('Waiting for the game…') }}</span>
        <span v-else-if="failed" class="text-xs text-red">{{ t('Not found: open the Journal on Duty and try again') }}</span>
        <span v-else-if="learned" class="text-xs text-darker">{{ t('Learned {when}', { when: dateTime(learned) }) }}</span>
        <button type="button" class="rounded-md border border-light px-2.5 py-1 text-xs text-dark hover:bg-dark disabled:opacity-50" :disabled="learning" @click="learn">{{ t(learned ? 'Learn again' : 'Learn') }}</button>
        <button v-if="learned && !learning" type="button" class="rounded-md border border-light px-2.5 py-1 text-xs text-dark hover:bg-dark" @click="forget">{{ t('Forget') }}</button>
      </div>
    </SettingRow>
    <OverlayWindowSettings overlay="duty" setting="duty" />
  </Section>
</template>
