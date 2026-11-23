<script setup lang="ts">
// Party frames (shared/party.ts): one bar per member of your party, made to heal by: their class
// icon and name on a bar of their HP, in the HP colour, or in the afflicted colour while a monster's
// debuff is on them (any, or only those taking control: the setting), to cleanse. One at 0 is down
// (grey, struck through, a skull), one not heard of for a while is out of range (faded). Everything
// else is a setting (dashboard/PartyView): size, colours, the HP as text, the debuffs' icons, a title
// bar. Up while you are in a party, moved by dragging it; while the dashboard is up out of a party,
// it shows a sample to place it by. Nothing to show measures 0, and main keeps it hidden.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CloseButton from '@/components/CloseButton.vue'
import CollapseButton from '@/components/CollapseButton.vue'
import { buffIcon, buffName, ccKind, hiddenBuff } from '@/lib/buffs.ts'
import { bridge } from '@/lib/bridge.ts'
import { t } from '@/lib/i18n.ts'
import { panelStyle } from '@/lib/overlayLook.ts'
import { windowDrag } from '@/lib/windowDrag.ts'
import { useApp } from '@/stores/app.ts'
import type { PartyDebuff, PartyMember, Vitals } from '@shared/party.ts'

const store = useApp()
const api = bridge()
const root = ref<HTMLElement | null>(null)
const cfg = computed(() => store.settings.party)

/** Not heard of for this long: out of range (the game sends nothing of them). */
const STALE_MS = 10_000
const now = ref(Date.now())
const ticker = setInterval(() => (now.value = Date.now()), 500)

const icons = import.meta.glob<string>('@/assets/classes/*.png', { eager: true, import: 'default' })
/** The engine's names for one class, the files' for it. */
const ALIAS: Record<string, string> = { elementalist: 'spiritmaster', summoner: 'spiritmaster' }
const icon = (className: string | null): string | null => {
  const name = className?.toLowerCase()
  return name ? (Object.entries(icons).find(([k]) => k.endsWith(`/classes/${ALIAS[name] ?? name}.png`))?.[1] ?? null) : null
}

interface Row {
  member: PartyMember
  vitals: Vitals | null
  you: boolean
  /** Those worth showing, control effects first. */
  debuffs: PartyDebuff[]
}
const shownDebuffs = (list: PartyDebuff[]): PartyDebuff[] =>
  list
    .filter((d) => !hiddenBuff(d.id, d.skill, d.endsAt !== null, d.endsAt !== null ? d.endsAt - d.startedAt : 0) && (d.endsAt === null || d.endsAt > now.value))
    .sort((a, b) => Number(!!ccKind(b.id)) - Number(!!ccKind(a.id)))
/** Afflicted, as the setting says: any debuff, or one taking control. */
const afflicted = (r: Row): boolean => (cfg.value.afflictedBy === 'control' ? r.debuffs.some((d) => ccKind(d.id)) : r.debuffs.length > 0)

/** The sample: a Stun (ICON_Abnormal_Stun) of 4 s on one, over and over. */
const SAMPLE = computed<Row[]>(() => {
  const stun: PartyDebuff = { id: 12000001, stacks: 1, endsAt: now.value + 4000 - (now.value % 4000), startedAt: now.value - 1000, skill: null }
  const at = now.value
  return [
    { member: { name: t('You'), slot: 1, level: 45, combatPower: 0, server: 0, className: 'Cleric', entity: -1 }, vitals: { hp: 26_672, maxHp: 26_672, flight: 0, maxFlight: 0, at }, you: true, debuffs: [] },
    { member: { name: t('A tank'), slot: 2, level: 45, combatPower: 0, server: 0, className: 'Templar', entity: -2 }, vitals: { hp: 24_100, maxHp: 31_400, flight: 0, maxFlight: 0, at }, you: false, debuffs: [] },
    { member: { name: t('A healer'), slot: 3, level: 45, combatPower: 0, server: 0, className: 'Chanter', entity: -3 }, vitals: { hp: 11_240, maxHp: 19_235, flight: 0, maxFlight: 0, at }, you: false, debuffs: [stun] },
    { member: { name: t('A ranger'), slot: 4, level: 45, combatPower: 0, server: 0, className: 'Ranger', entity: -4 }, vitals: { hp: 0, maxHp: 22_000, flight: 0, maxFlight: 0, at }, you: false, debuffs: [] },
  ]
})
const rows = computed<Row[]>(() =>
  store.party.members.map((m) => ({
    member: m,
    vitals: m.entity !== null ? (store.party.vitals[m.entity] ?? null) : null,
    you: m.name === store.status?.character,
    debuffs: m.entity !== null ? shownDebuffs(store.party.debuffs[m.entity] ?? []) : [],
  })),
)
/** Out of a party while the dashboard is up: a sample to place it by. */
const preview = computed(() => store.party.members.length < 2 && store.panelVisible)
/** Closed by its X: back with the next party. */
const closed = ref(false)
watch(
  () => store.party.members.length,
  (n, before) => {
    if (n > 1 && before < 2) closed.value = false
  },
)
const list = computed<Row[]>(() =>
  (closed.value ? [] : store.party.members.length > 1 ? rows.value : preview.value ? SAMPLE.value : []).filter((r) => cfg.value.self || !r.you),
)

const pct = (v: Vitals | null): number => (v && v.maxHp > 0 ? Math.max(0, Math.min(1, v.hp / v.maxHp)) : 1)
const down = (v: Vitals | null): boolean => !!v && v.hp === 0
const stale = (v: Vitals | null): boolean => !v || now.value - v.at > STALE_MS
const short = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString('en-US'))
const hpText = (v: Vitals | null): string => {
  if (!v || down(v)) return ''
  if (cfg.value.hpText === 'percent') return `${Math.round(pct(v) * 100)}%`
  if (cfg.value.hpText === 'value') return short(v.hp)
  return ''
}
const fill = (r: Row): string => (down(r.vitals) ? 'transparent' : afflicted(r) ? cfg.value.afflictedColor : cfg.value.hpColor)
const secondsLeft = (d: PartyDebuff): string => (d.endsAt === null ? '' : String(Math.max(0, Math.ceil((d.endsAt - now.value) / 1000))))

const set = (patch: Partial<typeof cfg.value>): void => void store.set('party', { ...cfg.value, ...patch })
const drag = windowDrag({ move: 'party:moveTo', end: 'party:dragEnd' })

let sent = ''
function report(): void {
  const el = root.value
  const r = el && list.value.length ? el.getBoundingClientRect() : { width: 0, height: 0 }
  const key = `${Math.ceil(r.width)}x${Math.ceil(r.height)}`
  if (key === sent) return
  sent = key
  void api.invoke('party:resize', { width: r.width, height: r.height })
}
watch([() => list.value.length, () => cfg.value.collapsed, () => cfg.value.header], () => void nextTick(report))

let observer: ResizeObserver | null = null
onMounted(() => {
  observer = new ResizeObserver(report)
  if (root.value) observer.observe(root.value)
  report()
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  observer?.disconnect()
})
</script>

<template>
  <div class="inline-block">
    <div ref="root" class="inline-block">
      <section
        v-if="list.length"
        :class="['m-1 cursor-move', cfg.header && 'overflow-hidden rounded-xl border']"
        :style="[{ width: `${cfg.width}px`, opacity: cfg.header ? undefined : cfg.opacity }, cfg.header ? panelStyle(cfg.opacity, '63 185 80') : {}]"
        :title="!cfg.header && preview ? t('drag to move') : undefined"
        @pointerdown="drag.onPointerDown($event)"
      >
        <header v-if="cfg.header" class="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-[12px]">
          <span class="shrink-0 font-semibold text-default">{{ t('Party') }}</span>
          <span v-if="preview" class="min-w-0 truncate text-[11px] text-darker">{{ t('drag to move') }}</span>
          <span class="flex-1" />
          <CollapseButton :collapsed="cfg.collapsed" class="-my-1" @toggle="set({ collapsed: !cfg.collapsed })" />
          <CloseButton v-if="!preview" class="-my-1 -mr-1" :title="t('Hide until the next party')" @close="closed = true" />
        </header>
        <ul v-if="!cfg.header || !cfg.collapsed" :class="['flex flex-col', cfg.header && 'px-1.5 pb-1.5']" :style="{ gap: `${cfg.gap}px` }">
          <li v-for="r in list" :key="r.member.name" :class="[stale(r.vitals) && !down(r.vitals) && 'opacity-45']">
            <div class="relative overflow-hidden rounded-[3px] bg-black/70 ring-1 ring-black/80" :style="{ height: `${cfg.barHeight}px` }">
              <div class="absolute inset-y-0 left-0 transition-[width,background-color] duration-300" :style="{ width: `${pct(r.vitals) * 100}%`, background: fill(r) }" />
              <div class="absolute inset-0 bg-gradient-to-b from-white/15 via-transparent to-black/25" />
              <div class="relative flex h-full items-center gap-1 px-1" :style="{ fontSize: `${cfg.fontSize}px` }">
                <img
                  v-if="cfg.icon && icon(r.member.className)"
                  :src="icon(r.member.className)!"
                  alt=""
                  draggable="false"
                  :class="['shrink-0 object-contain drop-shadow-[0_0_2px_rgba(0,0,0,0.9)]', down(r.vitals) && 'grayscale']"
                  :style="{ width: `${cfg.barHeight - 4}px`, height: `${cfg.barHeight - 4}px` }"
                />
                <span :class="['min-w-0 flex-1 truncate font-semibold leading-none [text-shadow:0_1px_2px_#000,0_0_2px_#000]', down(r.vitals) ? 'text-white/50 line-through' : 'text-white']">{{ r.member.name }}</span>
                <svg v-if="down(r.vitals)" viewBox="0 0 16 16" class="size-3.5 shrink-0 text-white/70" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2a5 5 0 0 0-3.5 8.5V13h7v-2.5A5 5 0 0 0 8 2zM6 8.5h.01M10 8.5h.01M7 13v-1.5M9 13v-1.5" /></svg>
                <span v-else-if="hpText(r.vitals)" class="shrink-0 font-semibold tabular-nums leading-none text-white [text-shadow:0_1px_2px_#000,0_0_2px_#000]">{{ hpText(r.vitals) }}</span>
              </div>
            </div>
            <div v-if="cfg.debuffIcons && r.debuffs.length && !down(r.vitals)" class="mt-0.5 flex flex-wrap gap-0.5">
              <span v-for="d in r.debuffs.slice(0, 8)" :key="d.id" class="relative size-[18px]" :title="buffName(d.id)">
                <img v-if="buffIcon(d.id, d.skill)" :src="buffIcon(d.id, d.skill)!" alt="" draggable="false" :class="['size-[18px] rounded-sm', ccKind(d.id) ? 'ring-1 ring-red' : 'ring-1 ring-black/60']" />
                <span v-if="secondsLeft(d)" class="absolute -bottom-0.5 right-0 text-[8px] font-bold tabular-nums leading-none text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">{{ secondsLeft(d) }}</span>
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
