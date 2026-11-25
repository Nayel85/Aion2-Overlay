<script setup lang="ts">
// Cache: what the app keeps on disk, kind by kind with its size, and a button to clear what can be
// cleared (main/storage.ts). Settings, the saved fights and the characters are never touched here.
// A section of the Settings page.
import { computed, onMounted, ref } from 'vue'
import Button from '@/components/Button.vue'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { formatBytes, type StorageId, type StorageUsage } from '@shared/storage.ts'

const api = bridge()
const usage = ref<StorageUsage | null>(null)
const busy = ref<StorageId | 'all' | null>(null)
/** The kind waiting for a second click: clearing recordings is not undone. */
const sure = ref<StorageId | null>(null)

const ROWS: { id: StorageId; label: string; about: string }[] = [
  { id: 'tiles', label: 'Map tiles', about: 'The detailed map pieces the Game Map Markers download. They are downloaded again the next time you need them.' },
  { id: 'browser', label: 'Interface cache', about: 'What the app\'s windows keep to open faster. It is rebuilt as you use the app.' },
  { id: 'logs', label: 'Error logs', about: 'What the engine and the map matching wrote down, for finding problems.' },
  { id: 'updates', label: 'Update downloads', about: 'Installers of updates left in the temporary folder.' },
  { id: 'recordings', label: 'Packet recordings', about: 'The recordings you made of the game\'s traffic (Settings). Deleted for good.' },
  { id: 'fights', label: 'Saved fights', about: 'Your Combat history. Not a cache: delete fights one by one from that page.' },
]
const bytesOf = (id: StorageId): number => usage.value?.items.find((i) => i.id === id)?.bytes ?? 0
/** The caches that are rebuilt (everything cleared but the recordings). */
const CACHES: StorageId[] = ['tiles', 'browser', 'logs', 'updates']
const cacheBytes = computed(() => CACHES.reduce((n, id) => n + bytesOf(id), 0))
const totalBytes = computed(() => (usage.value?.items ?? []).reduce((n, i) => n + i.bytes, 0))
const widest = computed(() => Math.max(1, ...(usage.value?.items ?? []).map((i) => i.bytes)))

async function load(): Promise<void> {
  usage.value = await api.invoke('storage:get')
}
async function clear(id: StorageId): Promise<void> {
  if (id === 'recordings' && sure.value !== id) {
    sure.value = id
    return
  }
  sure.value = null
  busy.value = id
  try {
    usage.value = await api.invoke('storage:clear', id)
  } finally {
    busy.value = null
  }
}
async function clearCaches(): Promise<void> {
  busy.value = 'all'
  try {
    for (const id of CACHES) usage.value = await api.invoke('storage:clear', id)
  } finally {
    busy.value = null
  }
}
onMounted(() => void load())
</script>

<template>
  <div>
    <div class="mb-3 flex items-start gap-4">
      <p class="flex-1 text-xs text-darker">{{ t('What the app keeps on your disk, and what can be cleared safely. Your settings, characters and saved fights are never cleared from here.') }}</p>
      <Button intent="primary" :loading="busy === 'all'" :disabled="!usage || cacheBytes === 0 || busy !== null" @click="clearCaches">
        {{ t('Clear the cache') }}<template v-if="usage"> ({{ formatBytes(cacheBytes) }})</template>
      </Button>
    </div>

    <p v-if="!usage" class="text-sm text-darker">{{ t('Loading…') }}</p>
    <template v-else>
      <div class="mb-4 flex items-baseline gap-3 rounded-xl border border-card bg-card px-4 py-3">
        <span class="text-2xl font-bold tabular-nums">{{ formatBytes(totalBytes) }}</span>
        <span class="text-sm text-darker">{{ t('in total on disk') }}</span>
        <span class="ml-auto truncate text-xs text-darkest" :title="usage.dir">{{ usage.dir }}</span>
      </div>

      <div class="overflow-hidden rounded-xl border border-card">
        <div v-for="row in ROWS" :key="row.id" class="flex items-center gap-4 border-b border-card px-4 py-3 last:border-b-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium">{{ t(row.label) }}</span>
              <span v-if="row.id === 'fights'" class="rounded border border-light px-1 text-[10px] text-darker">{{ t('your data') }}</span>
            </div>
            <div class="mt-0.5 text-xs text-darker">{{ t(row.about) }}</div>
            <div class="mt-2 h-1 overflow-hidden rounded-full bg-dark">
              <div class="h-full rounded-full bg-accent/70" :style="{ width: `${(bytesOf(row.id) / widest) * 100}%` }" />
            </div>
          </div>
          <span class="w-20 shrink-0 text-right text-sm font-semibold tabular-nums">{{ formatBytes(bytesOf(row.id)) }}</span>
          <div class="w-28 shrink-0 text-right">
            <Button
              v-if="row.id !== 'fights'"
              size="sm"
              :intent="sure === row.id ? 'danger' : 'default'"
              :loading="busy === row.id"
              :disabled="bytesOf(row.id) === 0 || busy !== null"
              @click="clear(row.id)"
            >
              {{ sure === row.id ? t('Sure? Delete') : t('Clear') }}
            </Button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
