<script setup lang="ts">
// Your characters' items (shared/inventory.ts), kept slot by slot as they log in and as items move:
// a character and a place picked (equipped, laid out as the game's window; bag; personal warehouse;
// Arcana; the account's warehouse), their items as tiles, a hovered one's details beside it; or,
// searched by name, where an item is across all of them. The character and place picked are
// remembered (this window's storage).
import { computed, ref, watch } from 'vue'
import ClassIcon from '@/components/ClassIcon.vue'
import ItemTile from '@/components/dashboard/ItemTile.vue'
import { gradeClass, ICON } from '@/components/panel/sessionIcons.ts'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { loc, plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { characterId } from '@shared/characters.ts'
import { PLACES, placeItems, placeSlots, whereIs, WORN_LAYOUT, type CharacterInventory, type Place, type SlotItem } from '@shared/inventory.ts'
import { itemIcon, itemInfo } from '@shared/sessions.ts'
import { baseLines, soulLine, stoneLine, type ItemDetails } from '@shared/equipment.ts'
import { bridge } from '@/lib/bridge.ts'

const store = useApp()

const STORAGE_KEY = 'inventory.view'
function saved(): { who: string | null; place: Place } {
  try {
    const v = { who: null, place: 'worn', ...(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as object) } as { who: string | null; place: Place }
    return PLACES.some((p) => p.id === v.place) ? v : { ...v, place: 'worn' }
  } catch {
    return { who: null, place: 'worn' }
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

/** The characters known, the latest first. */
const characters = computed(() => Object.entries(store.inventories.characters).sort((a, b) => b[1].at - a[1].at))
const picked = computed<[string, CharacterInventory] | null>(() => characters.value.find(([id]) => id === view.value.who) ?? characters.value[0] ?? null)
const className = (c: CharacterInventory): string | null => (c.server !== null ? (store.characters[characterId(c.server, c.name)]?.className ?? null) : null)

/** The place picked: its slots, by number. */
const slots = computed(() => placeSlots(store.inventories, picked.value?.[1] ?? null, view.value.place))
/** Its items as tiles: the bag and the warehouses slot by slot, as in game; the Arcana the best first. */
const tiles = computed(() =>
  Object.entries(slots.value)
    .map(([n, s]) => ({ n, s }))
    .sort((a, b) => (view.value.place === 'arcana' ? (itemInfo(b.s.item)?.grade ?? 0) - (itemInfo(a.s.item)?.grade ?? 0) || a.s.item - b.s.item : Number(a.n) - Number(b.n))),
)
const asOf = computed(() => (view.value.place === 'account' ? store.inventories.account?.at : picked.value?.[1].at) ?? null)
const placeOptions = computed(() => PLACES.map((p) => ({ id: p.id, label: p.label, count: Object.keys(placeSlots(store.inventories, picked.value?.[1] ?? null, p.id)).length })))

// ---- a hovered item's details ---------------------------------------------------------------

const hovered = ref<{ item: SlotItem; x: number; y: number } | null>(null)
function hover(item: SlotItem | null, at: { x: number; y: number }): void {
  hovered.value = item ? { item, ...at } : null
}
const GRADE_NAMES: [number, string][] = [
  [71, 'Mythic'],
  [61, 'Ancient'],
  [51, 'Legendary'],
  [41, 'Unique'],
  [31, 'Rare'],
  [21, 'Uncommon'],
  [0, 'Common'],
]
/** An equipment's base stats, asked once of the main process (questlog's): by item id, null while asked or none. */
const bases = ref(new Map<number, ItemDetails | null>())
watch(hovered, (h) => {
  const id = h?.item.item
  if (id === undefined || bases.value.has(id) || !h?.item.level) return
  bases.value = new Map(bases.value).set(id, null)
  void bridge()
    .invoke('items:details', id)
    .then((d) => (bases.value = new Map(bases.value).set(id, d)))
})
const details = computed(() => {
  const h = hovered.value
  if (!h) return null
  const info = itemInfo(h.item.item)
  const grade = info?.grade ?? 11
  const base = bases.value.get(h.item.item) ?? null
  const enchant = h.item.enchant ?? 0
  return {
    name: (info?.name ?? `#${h.item.item}`).replace(' (Bound)', ''),
    bound: info?.name.includes('(Bound)') ?? false,
    grade,
    gradeName: GRADE_NAMES.find(([g]) => grade >= g)![1],
    icon: itemIcon(info?.icon),
    enchant,
    amount: h.item.amount,
    // "70 (+21)": the base's level and what enchanting it added; its total alone without the base.
    level: h.item.level ? (base?.itemLevel ? `${base.itemLevel}${h.item.level > base.itemLevel ? ` (+${h.item.level - base.itemLevel})` : ''}` : String(h.item.level)) : null,
    base: base ? baseLines(base, enchant) : [],
    soul: (h.item.soul ?? []).map(([code, value]) => soulLine(code, value)),
    stones: (h.item.stones ?? []).filter((s): s is [number, number, number] => Array.isArray(s)).map(([stone, code, rank]) => stoneLine(stone, code, rank)),
    // Beside the pointer, kept on the screen.
    style: { left: `${Math.min(h.x + 16, window.innerWidth - 300)}px`, top: `${Math.max(8, Math.min(h.y + 12, window.innerHeight - 420))}px` },
  }
})

// ---- searched: where each item is ----------------------------------------------------------

const found = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (q.length < 2) return null
  const ids = new Set<string>()
  for (const [, c] of characters.value) for (const s of Object.values(c.slots)) ids.add(String(s.item))
  for (const s of Object.values(store.inventories.account?.slots ?? {})) ids.add(String(s.item))
  return [...ids]
    .map((id) => ({ id, info: itemInfo(id), where: whereIs(store.inventories, id) }))
    .filter((f) => (f.info?.name ?? '').toLowerCase().includes(q))
    .map((f) => ({ ...f, name: (f.info?.name ?? `#${f.id}`).replace(' (Bound)', ''), grade: f.info?.grade ?? 11, icon: itemIcon(f.info?.icon), total: f.where.reduce((n, w) => n + w[2], 0) }))
    .sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name))
})
const placeLabel = (p: Place): string => t(PLACES.find((x) => x.id === p)!.label)
const when = (ms: number): string => new Date(ms).toLocaleString(loc(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const amountText = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US') : `×${n}`)
const itemCount = computed(() => Object.keys(placeItems(slots.value)).length)
</script>

<template>
  <div>
    <PageHeader title="Inventory" about="What each of your characters has: their equipment, bag, own warehouse and Arcana, and the account's shared warehouse, as the game lists them at login and as items move. Hover an item for its details; search one to see where it is across all of them." />

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
        <div v-for="f in found" :key="f.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-card px-4 py-2 text-sm last:border-b-0">
          <img v-if="f.icon" :src="f.icon" alt="" class="size-7 rounded-sm" draggable="false" loading="lazy" />
          <svg v-else viewBox="0 0 16 16" :class="['size-7', gradeClass(f.grade)]" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path :d="ICON.box" /></svg>
          <span :class="['font-medium', gradeClass(f.grade)]">{{ f.name }}</span>
          <span class="font-semibold tabular-nums">{{ amountText(f.total) }}</span>
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

        <!-- Equipped: the game's window, two columns. -->
        <div v-if="view.place === 'worn'" class="inline-flex flex-col gap-1.5 rounded-xl border border-card bg-card/40 p-3">
          <div v-for="(row, i) in WORN_LAYOUT" :key="i" class="flex gap-1.5">
            <ItemTile v-for="n in row" :key="n" :slot-item="slots[n] ?? null" @hover="hover" />
          </div>
        </div>

        <!-- The bag, the warehouses, the Arcana: a grid of tiles. -->
        <div v-else class="rounded-xl border border-card p-3">
          <p v-if="!tiles.length" class="py-6 text-center text-xs text-darker">{{ t('Nothing there.') }}</p>
          <div v-else class="flex flex-wrap gap-1.5">
            <ItemTile v-for="x in tiles" :key="x.n" :slot-item="x.s" :size="48" @hover="hover" />
          </div>
          <div class="mt-2 text-xs text-darker">{{ plural(itemCount, '{n} item', '{n} items') }}</div>
        </div>
      </template>
    </template>

    <!-- A hovered item's details, beside the pointer. -->
    <div v-if="details" class="pointer-events-none fixed z-50 w-72 rounded-lg border border-light bg-default p-3 text-xs shadow-xl" :style="details.style">
      <div class="flex items-start gap-2">
        <img v-if="details.icon" :src="details.icon" alt="" class="size-10 shrink-0 rounded-sm" draggable="false" />
        <div class="min-w-0">
          <div :class="['text-sm font-semibold', gradeClass(details.grade)]">
            <template v-if="details.enchant">+{{ details.enchant }} </template>{{ details.name }}
          </div>
          <div class="text-darker">{{ t(details.gradeName) }}<template v-if="details.bound"> · {{ t('Bound') }}</template></div>
          <div v-if="details.level" class="text-darker">{{ t('Item Level') }} <span class="font-semibold text-default">{{ details.level }}</span></div>
        </div>
      </div>
      <div v-if="details.amount > 1" class="mt-2 tabular-nums">{{ t('Count') }} <span class="font-semibold">{{ details.amount.toLocaleString('en-US') }}</span></div>
      <!-- Its base stats (questlog's), with its enchantment's bonus. -->
      <div v-if="details.base.length" class="mt-2 space-y-0.5 border-t border-card pt-2 tabular-nums">
        <div v-for="l in details.base" :key="l.label" class="flex justify-between gap-3"><span>{{ t(l.label) }}</span><span>{{ l.value }}</span></div>
      </div>
      <!-- Its soul binding. -->
      <div v-if="details.soul.length" class="mt-2 space-y-0.5 border-t border-card pt-2 tabular-nums">
        <div class="text-accent">{{ t('Soul Binding') }}</div>
        <div v-for="(l, i) in details.soul" :key="i" class="flex justify-between gap-3"><span>{{ t(l.label) }}</span><span>{{ l.value }}</span></div>
      </div>
      <!-- Its stones, in their grade's colour, as the game's grid. -->
      <div v-if="details.stones.length" class="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-card pt-2 tabular-nums">
        <div v-for="(l, i) in details.stones" :key="i" :class="gradeClass(l.grade ?? 11)">{{ t(l.label) }} {{ l.value }}</div>
      </div>
    </div>
  </div>
</template>
