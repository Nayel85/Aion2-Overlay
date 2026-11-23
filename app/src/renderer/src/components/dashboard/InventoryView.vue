<script setup lang="ts">
// Your characters' items (shared/inventory.ts), as of each one's last login: a character and a place
// picked (bag, equipped, personal warehouse, Arcana, or the account's warehouse), their items the
// best first; or, searched by name, where an item is across all of them. The character and place
// picked are remembered (this window's storage).
import { computed, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import { gradeClass, ICON } from '@/components/panel/sessionIcons.ts'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { characterId } from '@shared/characters.ts'
import { PLACES, whereIs, type CharacterInventory, type Storage } from '@shared/inventory.ts'
import { itemIcon, itemInfo } from '@shared/sessions.ts'

const store = useApp()

type Place = Storage | 'account'
const STORAGE_KEY = 'inventory.view'
function saved(): { who: string | null; place: Place } {
  try {
    return { who: null, place: 'bag', ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as object) }
  } catch {
    return { who: null, place: 'bag' }
  }
}
const view = ref(saved())
watch(
  view,
  (v) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    } catch {
      // Storage unavailable: the view is only for this time.
    }
  },
  { deep: true },
)
const query = ref('')

/** The characters known, the latest login first. */
const characters = computed(() => Object.entries(store.inventories.characters).sort((a, b) => b[1].at - a[1].at))
const picked = computed<[string, CharacterInventory] | null>(() => characters.value.find(([id]) => id === view.value.who) ?? characters.value[0] ?? null)
const className = (c: CharacterInventory): string | null => (c.server !== null ? (store.characters[characterId(c.server, c.name)]?.className ?? null) : null)

interface Row {
  id: string
  name: string
  grade: number
  icon: string | null
  amount: number
}
function row(id: string, amount: number): Row {
  const item = itemInfo(id)
  return { id, name: (item?.name ?? `#${id}`).replace(' (Bound)', ''), grade: item?.grade ?? 11, icon: itemIcon(item?.icon), amount }
}
const byGrade = (a: Row, b: Row): number => b.grade - a.grade || a.name.localeCompare(b.name)

/** The place picked's items: the account's warehouse, or the character's. */
const placeItems = computed(() => (view.value.place === 'account' ? (store.inventories.account?.items ?? {}) : (picked.value?.[1].items[view.value.place] ?? {})))
const rows = computed(() => Object.entries(placeItems.value).map(([id, n]) => row(id, n)).sort(byGrade))
const asOf = computed(() => (view.value.place === 'account' ? store.inventories.account?.at : picked.value?.[1].at) ?? null)
const placeOptions = computed(() =>
  PLACES.map((p) => ({ id: p.id, label: p.label, count: Object.keys(p.id === 'account' ? (store.inventories.account?.items ?? {}) : (picked.value?.[1].items[p.id] ?? {})).length })),
)

/** Searched: every item of that name anywhere, with where it is. */
const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q.length < 2) return null
  const ids = new Set<string>()
  for (const [, c] of characters.value) for (const items of Object.values(c.items)) for (const id of Object.keys(items ?? {})) ids.add(id)
  for (const id of Object.keys(store.inventories.account?.items ?? {})) ids.add(id)
  return [...ids]
    .map((id) => ({ row: row(id, 0), where: whereIs(store.inventories, id) }))
    .filter((f) => f.row.name.toLowerCase().includes(q))
    .map((f) => ({ ...f, row: { ...f.row, amount: f.where.reduce((n, w) => n + w[2], 0) } }))
    .sort((a, b) => byGrade(a.row, b.row))
})
const placeLabel = (p: Place): string => t(PLACES.find((x) => x.id === p)!.label)
const when = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const amountText = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US') : `×${n}`)
</script>

<template>
  <div>
    <PageHeader title="Inventory" about="What each of your characters has, as the game lists it when they log in: their bag, what they wear, their own warehouse and their Arcana, and the account's shared warehouse. Search an item to see where it is across all of them." />

    <div v-if="!characters.length" class="rounded-xl border border-dashed border-card px-4 py-10 text-center">
      <div class="text-sm font-medium">{{ t('No inventory yet.') }}</div>
      <div class="mt-1 text-xs text-darker">{{ t('With the overlay open, log in with a character from the character selection: its items show here.') }}</div>
    </div>

    <template v-else>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <input
          v-model="query"
          type="search"
          :placeholder="t('Search an item on all your characters')"
          class="h-8 w-72 rounded-md border border-light bg-default px-2.5 text-sm placeholder:text-darkest focus:border-accent"
        />
      </div>

      <!-- Searched: where each item is. -->
      <div v-if="found" class="rounded-xl border border-card">
        <p v-if="!found.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('None of your characters has that.') }}</p>
        <div v-for="f in found" :key="f.row.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-card px-4 py-2 text-sm last:border-b-0">
          <img v-if="f.row.icon" :src="f.row.icon" alt="" class="size-6 rounded-sm" draggable="false" />
          <svg v-else viewBox="0 0 16 16" :class="['size-6', gradeClass(f.row.grade)]" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path :d="ICON.box" /></svg>
          <span :class="['font-medium', gradeClass(f.row.grade)]">{{ f.row.name }}</span>
          <span class="font-semibold tabular-nums">{{ amountText(f.row.amount) }}</span>
          <span class="flex flex-wrap gap-1.5 text-xs">
            <span v-for="(w, i) in f.where" :key="i" class="rounded-full bg-dark px-2 py-0.5">
              {{ w[0] ?? t('Account') }} · {{ placeLabel(w[1]) }} <span class="font-semibold tabular-nums">{{ amountText(w[2]) }}</span>
            </span>
          </span>
        </div>
      </div>

      <!-- A character's place, or the account's warehouse. -->
      <template v-else>
        <div class="mb-3 flex flex-wrap items-center gap-2">
          <button
            v-for="[id, c] in characters"
            :key="id"
            type="button"
            :class="['flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', picked?.[0] === id ? 'border-accent bg-accent/15 text-default' : 'border-light text-darker hover:text-default']"
            @click="view.who = id"
          >
            <ClassIcon :class-name="className(c)" :size="14" />{{ c.name }}
          </button>
        </div>
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <Segmented v-model="view.place" size="sm" :options="placeOptions" />
          <span v-if="asOf" class="text-xs text-darker">{{ t('As of {when}', { when: when(asOf) }) }}</span>
        </div>
        <div class="rounded-xl border border-card">
          <p v-if="!rows.length" class="px-4 py-6 text-center text-xs text-darker">{{ t('Nothing there.') }}</p>
          <div v-else class="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-3">
            <div v-for="r in rows" :key="r.id" class="flex items-center gap-2 border-b border-card px-4 py-1.5 text-sm">
              <img v-if="r.icon" :src="r.icon" alt="" class="size-6 shrink-0 rounded-sm" draggable="false" />
              <svg v-else viewBox="0 0 16 16" :class="['size-6 shrink-0', gradeClass(r.grade)]" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path :d="ICON.box" /></svg>
              <span :class="['min-w-0 flex-1 truncate', gradeClass(r.grade)]" :title="r.name">{{ r.name }}</span>
              <span class="tabular-nums text-dark">{{ amountText(r.amount) }}</span>
            </div>
          </div>
          <div class="px-4 py-2 text-xs text-darker">{{ plural(rows.length, '{n} item', '{n} items') }}</div>
        </div>
      </template>
    </template>
  </div>
</template>
