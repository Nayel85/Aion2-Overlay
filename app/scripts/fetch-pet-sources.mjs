/**
 * Snapshot where each pet comes from, for the merchant's window, the Pets page and the maps:
 *
 *   node scripts/fetch-pet-sources.mjs
 *
 * Writes src/renderer/src/data/petSources.json: pet id -> { kind, bosses, instances, other }.
 *   kind  'field'     its soul drops from monsters of the open world (some may be bosses)
 *         'boss'      ...from bosses alone there (questlog's heromonster: Divine Ansas...)
 *         'instance'  ...from monsters found only in instances (Fire Temple, Krao Cave...)
 *         'merchant'  from no monster at all: the Black Cloud Merchant's (or `other`'s, when known)
 *   bosses     the bosses whose kill drops it: { npc, name, level }
 *   instances  the instances its monsters live in, by world id
 *   other      its other known sources (a shop's merchant, a pack), the generic pet chests left out
 *
 * Source: questlog.gg's Aion 2 database and map (global client, `en`), used with credit: each soul
 * and unlock item (pets.json, petItems.json), each monster that drops one, and the map's markers
 * (one ~20 MB download) for where those monsters are. About 1,300 small requests, sequential, with a
 * pause between them: some 7 minutes. Re-run after a patch.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(APP, 'src', 'renderer', 'src', 'data')
const API = 'https://questlog.gg/aion-2/api/trpc'
const LANGUAGE = 'en'
const HEADERS = { 'user-agent': 'aion2-drop-tracker (personal pet collection tracker)', accept: 'application/json' }
const PAUSE_MS = 300
/** The open world: the continents, their starting zones and the Abyss. Any other world is an instance. */
const FIELD_WORLDS = new Set([20, 22, 23, 1000, 1010, 1011, 1100, 1110, 1111])
/** Chests that hold nearly every pet: no source of their own. */
const GENERIC = /^(Mysterious|Growth) Pet Chest|^Pet (Soul )?Chest: /

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function trpc(proc, input) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${proc}?input=${encodeURIComponent(JSON.stringify(input))}`, { headers: HEADERS })
    if (res.ok) return (await res.json()).result.data
    if (attempt === 3) throw new Error(`${proc} ${JSON.stringify(input)}: HTTP ${res.status}`)
    await sleep(2000)
  }
}

const pets = JSON.parse(readFileSync(join(DATA, 'pets.json'), 'utf8')).pets
const petItems = JSON.parse(readFileSync(join(DATA, 'petItems.json'), 'utf8'))
const itemsOf = new Map(pets.map((p) => [p.id, []]))
for (const kind of ['souls', 'pets']) for (const [item, pet] of Object.entries(petItems[kind])) itemsOf.get(pet)?.push(item)

console.log('pet items…')
const items = new Map()
let n = 0
for (const list of itemsOf.values())
  for (const id of list) {
    items.set(id, await trpc('database.getItem', { language: LANGUAGE, id }))
    await sleep(PAUSE_MS)
    if (++n % 50 === 0) console.log(`  ${n}`)
  }

console.log('the monsters that drop them…')
const npcIds = new Set([...items.values()].flatMap((i) => (i?.itemIsDroppedByNpcs ?? []).map((d) => d.id)))
const npcs = new Map()
n = 0
for (const id of npcIds) {
  npcs.set(id, await trpc('database.getNpc', { language: LANGUAGE, id }))
  await sleep(PAUSE_MS)
  if (++n % 100 === 0) console.log(`  ${n}/${npcIds.size}`)
}

console.log('map markers (one large download)…')
const worldsOf = new Map()
for (const m of await trpc('map.getMarkers', { language: LANGUAGE })) {
  if (m.dbType !== 'npc' || !npcIds.has(String(m.dbId))) continue
  const set = worldsOf.get(String(m.dbId)) ?? new Set()
  set.add(Number(m.mapWorldId))
  worldsOf.set(String(m.dbId), set)
}

const out = {}
for (const p of pets) {
  const drops = []
  const other = new Set()
  for (const id of itemsOf.get(p.id) ?? []) {
    const item = items.get(id) ?? {}
    for (const d of item.itemIsDroppedByNpcs ?? []) drops.push({ npc: Number(d.id), name: d.name, level: d.level, boss: npcs.get(d.id)?.npcSubType === 'heromonster', worlds: [...(worldsOf.get(d.id) ?? [])] })
    for (const c of item.itemIsContainedInItems ?? []) if (!GENERIC.test(c.name)) other.add(c.name.replace(' (Bound)', ''))
    for (const s of item.itemIsSoldByNpcs ?? []) other.add(s.name)
  }
  const field = drops.filter((d) => d.worlds.some((w) => FIELD_WORLDS.has(w)))
  const inInstance = drops.filter((d) => d.worlds.some((w) => !FIELD_WORLDS.has(w)))
  const kind = field.length ? (field.every((d) => d.boss) ? 'boss' : 'field') : inInstance.length ? 'instance' : 'merchant'
  const bosses = [...new Map(drops.filter((d) => d.boss).map((d) => [d.npc, { npc: d.npc, name: d.name, level: d.level }])).values()]
  const instances = [...new Set(inInstance.flatMap((d) => d.worlds.filter((w) => !FIELD_WORLDS.has(w))))].sort((a, b) => a - b)
  out[p.id] = { kind, ...(bosses.length ? { bosses } : {}), ...(instances.length ? { instances } : {}), ...(other.size ? { other: [...other].sort() } : {}) }
}
const counts = Object.values(out).reduce((c, s) => ({ ...c, [s.kind]: (c[s.kind] ?? 0) + 1 }), {})
writeFileSync(join(DATA, 'petSources.json'), JSON.stringify({ source: 'https://questlog.gg/aion-2/en/db', fetched: new Date().toISOString().slice(0, 10), pets: out }))
console.log('pets by source:', counts)
