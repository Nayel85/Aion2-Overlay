<script setup lang="ts">
// Your characters' items (shared/inventory.ts), kept slot by slot as they log in and as items move:
// a character and a place picked (equipped, laid out as the game's window; bag; personal warehouse;
// Arcana; the account's warehouse), their items as tiles, a hovered one's details beside it; or,
// searched by name, where an item is across all of them and when it last came. Under a character's
// place, what came into their hands lately (the journal: main/inventory.ts), with where from when known.
// The character and place picked are remembered (this window's storage).
import EmptyState from '@/components/ui/EmptyState.vue'
import { gradeName } from '@/lib/grades.ts'
import CharacterChips from '@/components/CharacterChips.vue'
import { fullDateTime } from '@/lib/format.ts'
import { useStored } from '@/lib/now.ts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ItemTile from '@/components/dashboard/ItemTile.vue'
import { ICON } from '@/components/panel/sessionIcons.ts'
import { gradeClass } from '@/lib/grades.ts'
import PageHeader from '@/components/ui/PageHeader.vue'
import Segmented from '@/components/ui/Segmented.vue'
import { plural, t } from '@/lib/i18n.ts'
import { useApp } from '@/stores/app.ts'
import { ARRIVAL_SOURCES, PLACES, placeItems, placeSlots, whereIs, WORN_ARCANA, WORN_LAYOUT, type Arrival, type CharacterInventory, type Place, type SlotItem } from '@shared/inventory.ts'
import { itemIcon, itemInfo } from '@shared/sessions.ts'
import { arcanaStatLine, baseLines, skillLine, soulLine, soulRate, stoneLine, theostoneOf, type ItemDetails } from '@shared/equipment.ts'
import { bridge } from '@/lib/bridge.ts'

const store = useApp()

/** Whose and which place, remembered in this window's storage. */
const view = useStored<{ who: string | null; place: Place }>('inventory.view', { who: null, place: 'worn' }, (raw) => {
  const v = { who: null, place: 'worn', ...(raw as object) } as { who: string | null; place: Place }
  return PLACES.some((p) => p.id === v.place) ? v : { ...v, place: 'worn' }
})
const query = ref('')

/** The characters known, the latest first. */
const characters = computed(() => Object.entries(store.inventories.characters).sort((a, b) => b[1].at - a[1].at))
const picked = computed<[string, CharacterInventory] | null>(() => characters.value.find(([id]) => id === view.value.who) ?? characters.value[0] ?? null)

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
/** An equipment's base stats, asked once of the main process (questlog's): by item id, null while asked or none. */
const bases = ref(new Map<number, ItemDetails | null>())
function ask(id: number): void {
  if (bases.value.has(id)) return
  bases.value = new Map(bases.value).set(id, null)
  void bridge()
    .invoke('items:details', id)
    .then((d) => (bases.value = new Map(bases.value).set(id, d)))
}
watch(hovered, (h) => {
  if (!h?.item.level) return
  ask(h.item.item)
  // Its Theostone's effect, told by its item.
  const theo = theostoneOf(h.item.theostone ?? 0)
  if (theo) ask(theo.item)
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
    gradeName: gradeName(grade),
    icon: itemIcon(info?.icon),
    enchant,
    amount: h.item.amount,
    // "70 (+21)": the base's level and what enchanting it added; its total alone without the base.
    level: h.item.level ? (base?.itemLevel ? `${base.itemLevel}${h.item.level > base.itemLevel ? ` (+${h.item.level - base.itemLevel})` : ''}` : String(h.item.level)) : null,
    base: base ? baseLines(base, enchant) : [],
    soul: (h.item.soul ?? []).map(([code, value]) => soulLine(code, value, base?.soulRange)),
    soulRate: soulRate(h.item.soul ?? [], (h.item.skills ?? []).length, base?.soulRange),
    skills: (h.item.skills ?? []).map(([skill, levels]) => skillLine(skill, levels)),
    stats: (h.item.stats ?? []).map(([code, value]) => arcanaStatLine(code, value)),
    theostone: (() => {
      const theo = theostoneOf(h.item.theostone ?? 0)
      return theo ? { ...theo, icon: itemIcon(theo.icon), description: bases.value.get(theo.item)?.description ?? '' } : null
    })(),
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
const when = fullDateTime
const amountText = (n: number): string => (n >= 10_000 ? n.toLocaleString('en-US') : `×${n}`)
const itemCount = computed(() => Object.keys(placeItems(slots.value)).length)

// ---- what came in -----------------------------------------------------------------------------

const ARRIVALS_SHOWN = 40
const arrivals = ref<Arrival[]>([])
let off: (() => void) | null = null
onMounted(async () => {
  off = bridge().on('inventory:arrival', (a) => (arrivals.value = [...arrivals.value, a]))
  arrivals.value = await bridge().invoke('inventory:arrivals')
})
onBeforeUnmount(() => off?.())
/** The picked character's, the latest first, each item named. */
const recent = computed(() =>
  arrivals.value
    .filter((a) => a.character === picked.value?.[0])
    .slice(-ARRIVALS_SHOWN)
    .reverse()
    .map((a) => ({ ...a, list: Object.entries(a.items).map(([id, n]) => ({ id, n, info: itemInfo(id) })).sort((x, y) => (y.info?.grade ?? 0) - (x.info?.grade ?? 0)) })),
)
/** By item id, when it last came (whoever to). */
const lastCame = computed(() => {
  const by = new Map<string, Arrival>()
  for (const a of arrivals.value) for (const id of Object.keys(a.items)) by.set(id, a)
  return by
})
/** When an arrival came, and where from: "Tue 24 Nov, 21:40 · Hidden Cube"; one while the app was off, between its two times. */
function cameText(a: Arrival): string {
  const at = a.since !== undefined ? t('Between {from} and {to}', { from: when(a.since), to: when(a.at) }) : when(a.at)
  return a.source ? `${at} · ${t(ARRIVAL_SOURCES[a.source])}` : at
}
</script>

<template>
  <div>
    <PageHeader title="Inventory" about="What each of your characters has: their equipment, bag, own warehouse and Arcana, and the account's shared warehouse, as the game lists them at login and as items move. Hover an item for its details; search one to see where it is across all of them." />

    <EmptyState v-if="!characters.length" title="No inventory yet." hint="With the overlay open, log in with a character from the character selection: its items show here." />

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
          <span v-if="lastCame.get(f.id)" class="text-xs text-darker">{{ t('Came to {name}: {when}', { name: lastCame.get(f.id)!.name, when: cameText(lastCame.get(f.id)!) }) }}</span>
          <span class="flex flex-wrap gap-1.5 text-xs">
            <span v-for="(w, i) in f.where" :key="i" class="rounded-full bg-dark px-2 py-0.5">
              {{ w[0] ?? t('Account') }} · {{ placeLabel(w[1]) }} <span class="font-semibold tabular-nums">{{ amountText(w[2]) }}</span>
            </span>
          </span>
        </div>
      </div>

      <!-- A character's place, or the account's warehouse. -->
      <template v-else>
        <CharacterChips :model-value="picked?.[0] ?? null" class="mb-3" :all="false" :characters="characters.map(([id, c]) => ({ id, name: c.name }))" @update:model-value="view.who = $event as string" />
        <div class="mb-3 flex flex-wrap items-center gap-3">
          <Segmented v-model="view.place" size="sm" :options="placeOptions" />
          <span v-if="asOf" class="text-xs text-darker">{{ t('As of {when}', { when: when(asOf) }) }}</span>
        </div>

        <!-- Equipped: the game's window, two columns. -->
        <div v-if="view.place === 'worn'" class="flex flex-wrap items-start gap-4">
          <div class="inline-flex flex-col gap-1.5 rounded-xl border border-card bg-card/40 p-3">
            <div v-for="(row, i) in WORN_LAYOUT" :key="i" class="flex gap-1.5">
              <ItemTile v-for="n in row" :key="n" :slot-item="slots[n] ?? null" @hover="hover" />
            </div>
          </div>
          <!-- The Arcana worn. -->
          <div class="rounded-xl border border-card bg-card/40 p-3">
            <div class="mb-2 text-xs font-medium text-darker">{{ t('Arcana') }}</div>
            <div class="flex gap-1.5">
              <ItemTile v-for="n in WORN_ARCANA" :key="n" :slot-item="slots[n] ?? null" @hover="hover" />
            </div>
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

        <!-- What came into their hands lately. -->
        <div class="mt-4 rounded-xl border border-card">
          <div class="border-b border-card px-4 py-2 text-xs font-medium text-darker">{{ t('Came in lately') }}</div>
          <p v-if="!recent.length" class="px-4 py-4 text-center text-xs text-darker">{{ t('Nothing yet: what comes in from now on shows here, with when and where from.') }}</p>
          <div v-for="a in recent" :key="`${a.at}-${a.source}`" class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-card px-4 py-1.5 text-xs last:border-b-0">
            <span class="tabular-nums text-darker">{{ cameText(a) }}</span>
            <span v-for="x in a.list" :key="x.id" class="flex items-center gap-1 tabular-nums" :title="x.info?.name">
              <img v-if="itemIcon(x.info?.icon)" :src="itemIcon(x.info?.icon)!" alt="" class="size-4 rounded-sm" draggable="false" loading="lazy" />
              <span :class="gradeClass(x.info?.grade ?? 11)">{{ (x.info?.name ?? `#${x.id}`).replace(' (Bound)', '') }}</span> ×{{ x.n }}
            </span>
          </div>
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
      <!-- An Arcana's own stats. -->
      <div v-if="details.stats.length" class="mt-2 space-y-0.5 border-t border-card pt-2 tabular-nums">
        <div v-for="(l, i) in details.stats" :key="i" class="flex justify-between gap-3"><span>{{ t(l.label) }}</span><span>{{ l.value }}</span></div>
      </div>
      <!-- Its soul binding. -->
      <div v-if="details.soul.length" class="mt-2 space-y-0.5 border-t border-card pt-2 tabular-nums">
        <div class="flex justify-between gap-3 text-accent">
          <span>{{ t('Soul Binding') }}</span><span v-if="details.soulRate !== null" class="font-semibold">{{ details.soulRate.toFixed(1) }}%</span>
        </div>
        <div v-for="(l, i) in details.soul" :key="i" class="flex justify-between gap-3">
          <span>{{ t(l.label) }}</span><span>{{ l.value }}<span v-if="l.roll !== undefined" class="ml-1.5 text-[10px] text-darker">({{ l.roll }}%)</span></span>
        </div>
      </div>
      <!-- The skills it raises. -->
      <div v-if="details.skills.length" class="mt-2 space-y-0.5 border-t border-card pt-2 tabular-nums">
        <div v-for="(l, i) in details.skills" :key="i" class="flex justify-between gap-3 text-accent"><span>{{ l.label }}</span><span class="text-default">{{ l.value }}</span></div>
      </div>
      <!-- Its Theostone, and what it does. -->
      <div v-if="details.theostone" class="mt-2 border-t border-card pt-2">
        <div class="flex items-center gap-1.5 font-medium text-green">
          <img v-if="details.theostone.icon" :src="details.theostone.icon" alt="" class="size-4 rounded-sm" draggable="false" />{{ details.theostone.name }}
        </div>
        <div v-if="details.theostone.description" class="mt-0.5 whitespace-pre-line text-dark">{{ details.theostone.description }}</div>
      </div>
      <!-- Its stones, in their grade's colour, as the game's grid. -->
      <div v-if="details.stones.length" class="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-card pt-2 tabular-nums">
        <div v-for="(l, i) in details.stones" :key="i" :class="gradeClass(l.grade ?? 11)">{{ t(l.label) }} {{ l.value }}</div>
      </div>
    </div>
  </div>
</template>
