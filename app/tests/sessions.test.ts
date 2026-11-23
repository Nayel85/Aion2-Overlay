import assert from 'node:assert/strict'
import test from 'node:test'
import { apSource, dungeonOf, mergeRuns, runGroups, gatheredByGrade, gatheredRows, noteGathering, pveInstance, kinaSource, goldKind, lootCounts, notableLoot, runRewards, questReward, runCounts, runIsNoise, runName, sourceLabel, type PlaySession, type RecentGain } from '../src/shared/sessions.ts'
import { expectedOf, filterRuns, itemStats, lootRuns, luck, summaries, unitsOf } from '../src/shared/lootStats.ts'

// 2026-11-22 03:05 UTC is in the 03:00 rift's window (opened at 02:00 UTC); 04:30 UTC is not.
const inRift = Date.UTC(2026, 10, 22, 2, 30)
const noRift = Date.UTC(2026, 10, 22, 4, 30)

test('a gain right after your PvP kill is PvP: the Abyss, the rift, elsewhere', () => {
  assert.equal(apSource(600, noRift, 20, noRift - 2_000), 'abyssPvp')
  assert.equal(apSource(600, inRift, 1110, inRift - 2_000), 'rift')
  assert.equal(apSource(600, noRift, 700100, noRift - 2_000), 'pvp')
  // Too long after the kill: not it.
  assert.equal(apSource(220, noRift, 20, noRift - 10_000), 'abyssMobs')
})

test('corridors, rewards, monsters and zones not named yet', () => {
  assert.equal(apSource(250, noRift, 503002, null), 'corridor')
  assert.equal(apSource(5_000, noRift, 503002, null), 'corridor')
  // A big gain alone is no longer a reward: the quests say theirs (questReward).
  assert.equal(apSource(5_000, noRift, 20, null), 'abyssMobs')
  assert.equal(apSource(220, noRift, 22, null), 'abyssMobs')
  assert.equal(apSource(220, inRift, 1010, null), 'rift')
  assert.equal(apSource(220, noRift, 1010, null), 'continentMobs')
  assert.equal(apSource(220, noRift, 704001, null), 'zone:704001')
  assert.equal(apSource(220, noRift, null, null), 'other')
})

test("Kina's sources: corridors, then the zone, else unknown", () => {
  assert.equal(kinaSource(noRift, 503001), 'corridor')
  assert.equal(kinaSource(noRift, 20), 'abyssMobs')
  assert.equal(kinaSource(inRift, 1110), 'rift')
  assert.equal(kinaSource(noRift, 1110), 'continentMobs')
  assert.equal(kinaSource(noRift, 704001), 'zone:704001')
  assert.equal(kinaSource(noRift, null), 'other')
})

test('arenas are their own source; the other instances go by their name', () => {
  assert.equal(apSource(300, noRift, 7, null), 'arena')
  assert.equal(apSource(600, noRift, 14, noRift - 1_000), 'arena')
  assert.equal(kinaSource(noRift, 12), 'arena')
  assert.equal(sourceLabel('zone:690011'), 'Beritra Brigade Fortress')
  assert.equal(sourceLabel('zone:999999999'), 'Zone 999999999')
})

test("a quest's reward is taken from the gain it came with", () => {
  // The Abyss Supply Request of 2026-11-22: 770 AP, counted as Abyss monsters as it came.
  const s: PlaySession = { name: 'Nayell', server: 1305, start: 0, last: 1000, ap: 1_000, sources: { abyssMobs: 1_000 }, kina: 0, kinaSources: {} }
  const recent: RecentGain[] = [{ at: 900, kind: 'ap', gained: 230, source: 'abyssMobs' }, { at: 1000, kind: 'ap', gained: 770, source: 'abyssMobs' }]
  assert.equal(questReward(s, recent, 'ap', 770, 1000), true)
  assert.deepEqual(s.sources, { abyssMobs: 230, reward: 770 })
  // Too late after any gain: nothing to take.
  assert.equal(questReward(s, recent, 'ap', 200, 9000), false)
})

test("a dungeon's gains are the dungeon's, by its name, its rewards too", () => {
  assert.equal(apSource(250_000, noRift, 220022, null), 'dungeon:220022')
  assert.equal(kinaSource(noRift, 210004), 'dungeon:210004')
  assert.equal(sourceLabel('dungeon:220022'), 'Dungeon: Fire Temple')
  assert.equal(apSource(220, noRift, 23, null), 'abyssMobs')
  assert.equal(kinaSource(noRift, 1000), 'continentMobs')
  const s: PlaySession = { name: 'Nayel', server: 1305, start: 0, last: 1000, ap: 0, sources: {}, kina: 300_000, kinaSources: { 'dungeon:220022': 300_000 } }
  const recent: RecentGain[] = [{ at: 1000, kind: 'kina', gained: 300_000, source: 'dungeon:220022' }]
  assert.equal(questReward(s, recent, 'kina', 300_000, 1000), true)
  assert.deepEqual(s.kinaSources, { 'dungeon:220022': 300_000 })
})

test('a dungeon is a zone the game gives a dungeon type; arenas and the open world are not', () => {
  assert.deepEqual(dungeonOf(220022), ['Fire Temple', 'quest'])
  assert.deepEqual(dungeonOf(503001), ['Abyss Corridor', 'abyssartifact'])
  assert.deepEqual(dungeonOf(900001), ['Daeva Bio-Research Base', 'daily'])
  assert.deepEqual(dungeonOf(200003), ['Nightmare', 'bosschallenge'])
  // A party dungeon's mode: Exploration, Conquest (Normal, Hard), Transcendence (stages 1-4).
  assert.deepEqual(dungeonOf(600021), ['Fire Temple', 'exploration'])
  assert.deepEqual(dungeonOf(600023), ['Fire Temple', 'conquest'])
  assert.deepEqual(dungeonOf(600058), ['Deus Research Base', 'transcendence'])
  const run = { name: 'Deus Research Base', kind: 'transcendence', start: 0, end: null, ap: 0, kina: 0, currencies: {} }
  assert.equal(runName({ ...run, world: 600058 }), 'Deus Research Base · Stage 3')
  assert.equal(runName({ ...run, world: 610062, name: 'Shattered Arkanis' }), 'Shattered Arkanis · Stage 4')
  assert.equal(runName({ ...run, world: 600023, name: 'Fire Temple' }), 'Fire Temple · Hard')
  assert.equal(runName({ ...run, world: 600021, name: 'Fire Temple' }), 'Fire Temple')
  // An arena, an open-world layer, the open world: none.
  assert.equal(dungeonOf(39), null)
  assert.equal(dungeonOf(7), null)
  assert.equal(dungeonOf(1010), null)
  assert.equal(dungeonOf(null), null)
})

test("every dungeon's gains are its own, the Nightmares' too", () => {
  assert.equal(kinaSource(noRift, 600021), 'dungeon:600021')
  assert.equal(apSource(500, noRift, 200003, null), 'dungeon:200003')
  assert.equal(sourceLabel('dungeon:200003'), 'Dungeon: Nightmare')
})

test("a Nightmare is named by its boss and level", () => {
  const run = { world: 200003, name: 'Nightmare', kind: 'bosschallenge', start: 0, end: null, boss: 2002, level: 4, ap: 0, kina: 0, currencies: {} }
  assert.equal(runName(run), 'Mutated Gerod · 4')
  assert.equal(runName({ ...run, boss: 1003, level: 10 }), "Fafnir's Poison Blood · 10")
})

test('a run left with nothing does not count; in and out within a minute is not kept', () => {
  const base = { world: 200003, name: 'Nightmare', kind: 'bosschallenge', start: 0, end: 30_000, ap: 0, kina: 0, currencies: {} }
  assert.equal(runCounts(base), false)
  assert.equal(runIsNoise(base), true)
  assert.equal(runIsNoise({ ...base, end: 5 * 60_000 }), false)
  assert.equal(runCounts({ ...base, cleared: 20_000 }), true)
  assert.equal(runCounts({ ...base, currencies: { 930100017: 1300 } }), true)
  assert.equal(runIsNoise({ ...base, end: null }), false)
})

test("a cube's loot keeps all but the lesser equipment, Kina first", () => {
  // The owner's 2026-11-22 Vakron Sky Island cube (membership's second cube in the same list), in part.
  const items = [[930100031, 600000], [930100023, 4000], [110360038, 1], [110340047, 1], [210340047, 1], [631800004, 1], [630840002, 14], [610530005, 1], [600590001, 1], [535400001, 6]]
  const loot = notableLoot(items.map(([item, amount]) => ({ item: item!, amount: amount! })))
  assert.equal(loot['110360038'], undefined)
  assert.equal(loot['110340047'], undefined)
  const run = { world: 600072, name: 'Vakron Sky Island', kind: 'conquest', start: 0, end: 1, ap: 0, kina: 0, currencies: {}, loot }
  // Kina and the currencies first (the run's own totals: the cube's 4,000 Enhance Stones and the
  // auto-extraction's 1,301), then the cube's items, the best first; each with the game's icon.
  const rows = runRewards({ ...run, kina: 600_000, currencies: { '930100023': 5301 } })
  assert.deepEqual(rows.map((r) => [r.name, r.amount]), [['Kina', 600000], ['Enhance Stone', 5301], ['Silentium (Bound)', 14], ['Soul Codex (Bound)', 6], ['Amplify Stone Fragment (Unique) (Bound)', 1], ["Balaur's Essence", 1], ["Expert's Refining Stone", 1]])
  assert.equal(rows[0]!.icon, 'items/loot/Icon_Currency_Coin_GoldNonbinding.webp')
  // A run whose Kina was not counted (an older build): its cube's stand.
  assert.equal(runRewards(run)[0]!.amount, 600000)
  // Its Unique-or-better: the Amplify Stone Fragment, a crafting material.
  assert.deepEqual(lootCounts([run]), { equipment: 0, craft: 1, wings: 0, cards: 0 })
  assert.equal(runCounts({ ...run, end: 1 }), true)
})

test('gold loot apart: equipment, crafting materials, wings and artworks; by character and by item, per run, cube or hour', () => {
  assert.equal(goldKind(210230052), 'equipment') // Vakron Greaves (a cube's)
  assert.equal(goldKind(115030002), 'equipment') // Wisdom Guard
  assert.equal(goldKind(610511014), 'craft') // Wrathful Will
  assert.equal(goldKind(602460004), 'wings') // Sealed Forest Spirit Wings
  assert.equal(goldKind(610530001), null) // Refining Stone: not gold
  const run = (kind: string, loot: Record<string, number>, cubes?: number) => ({ world: 600072, name: 'Vakron Sky Island', kind, start: 0, end: 600_000, ap: 0, kina: 0, currencies: {}, loot, cubes })
  const session = (name: string, runs: ReturnType<typeof run>[]) => ({ name, server: 1305, start: 0, last: 1, ap: 0, sources: {}, kina: 0, kinaSources: {}, currencies: {}, runs }) as unknown as PlaySession
  const runs = lootRuns([
    session('Nayoul', [run('conquest', { 210230052: 1, 930100031: 600000 }), run('conquest', { 610511014: 2 }, 1), run('shugo', { 602460004: 1 })]),
    session('Nayel', [run('conquest', { 602460004: 1, 930100031: 300000 })]),
  ])
  // The Shugo Festival's is not a dungeon's; per character, most runs first, then all of them.
  const rows = summaries(runs)
  assert.deepEqual(rows.map((r) => [r.name, r.runs, r.cubes, r.equipment, r.craft, r.wings]), [['Nayoul', 2, 3, 1, 2, 0], ['Nayel', 1, 1, 0, 0, 1], ['', 3, 4, 1, 2, 1]])
  assert.equal(unitsOf(rows[2]!, 'hour'), 0.5)
  assert.deepEqual(filterRuns(runs, { names: ['Nayel'], from: 0, kind: null, world: null }).length, 1)
  // By item: in all, and in how many runs.
  const wrath = itemStats(runs.map((r) => r.run)).find((i) => i.id === '610511014')!
  assert.deepEqual([wrath.family, wrath.total, wrath.runs], ['craft', 2, 1])
  // What the game's rates make of a run's cubes: Vakron's Amplify Stone Fragment (Unique), 48.8% a
  // cube on questlog, one at least over its 3 bosses' rolls (20% each in game): 0.6 a cube, 1.2 for
  // 2 cubes; your luck, what you got against it.
  assert.equal(Math.round(expectedOf(run('conquest', {}, 2), '631800004') * 100) / 100, 1.2)
  assert.equal(luck(5, 2.5), 2)
  assert.equal(luck(1, 0), null)
})

test('the other players of a PvE instance are not enemies; the Abyss Corridors and the world have some', () => {
  assert.equal(pveInstance(600072), true)
  assert.equal(pveInstance(610052), true)
  assert.equal(pveInstance(503001), false)
  assert.equal(pveInstance(1010), false)
  assert.equal(pveInstance(7), false)
  assert.equal(pveInstance(null), false)
})

test('the resources gathered list by grade, the best first', () => {
  // The owner's 2026-11-22 gathering: Odyle, Fine Odyle, Odyle.
  const s = { name: 'Nayoul', server: 1305, start: 0, last: 0, ap: 0, sources: {}, kina: 0, gathered: { '610610013': 2, '610610014': 1 } }
  assert.deepEqual(gatheredRows(s).map((r) => r.slice(0, 3)), [['Fine Odyle', 21, 1], ['Odyle', 11, 2]])
  assert.deepEqual(gatheredByGrade(s), [[21, 1], [11, 2]])
})

test("a Shugo Festival's game is a run; the chests you opened are its rewards", () => {
  assert.deepEqual(dungeonOf(500035), ['Up! Up! Up!', 'fieldevent'])
  // The open world's events are not.
  assert.equal(dungeonOf(78), null)
  const run = { world: 500035, name: 'Up! Up! Up!', kind: 'shugo', start: 0, end: 1, ap: 1320, kina: 0, currencies: { '930100023': 2100 } }
  assert.equal(runName(run), 'Shugo Festival · Up! Up! Up!')
  // The owner's three chests, in part: Centuryroot Tokens, Odyle, a Pure Odyle; the lesser equipment is not kept.
  const loot = notableLoot([{ item: 930100011, amount: 50 }, { item: 610610013, amount: 3 }, { item: 610610015, amount: 1 }, { item: 115060034, amount: 1 }])
  assert.deepEqual(loot, { '930100011': 50, '610610013': 3, '610610015': 1 })
  const rows = runRewards({ ...run, loot })
  assert.deepEqual(rows.map((r) => [r.name, r.amount]), [['Abyss Points', 1320], ['Centuryroot Token', 50], ['Enhance Stone', 2100], ['Pure Odyle', 1], ['Odyle', 3]])
  assert.ok(rows.every((r) => r.icon))
})

test("a session's gathering stats: done, failed, doubled, ranked up, and the successes by grade", () => {
  // The owner's 2026-11-22 gatherings: an Odyle doubled, a rank up to Fine Odyle, Odyle; Odyle three times, a failure, a Pure Odyle doubled.
  const s: PlaySession = { name: 'Nayoul', server: 1305, start: 0, last: 0, ap: 0, sources: {}, kina: 0 }
  for (const [item, amount, result, bonus] of [[610610013, 1, 0, 1], [610610014, 1, 1, 0], [610610013, 1, 0, 0], [610610013, 1, 0, 0], [610610013, 1, 0, 0], [610610013, 1, 0, 0], [610610013, 0, 2, 0], [610610015, 1, 0, 1]] as const) noteGathering(s, item, amount, result, bonus)
  assert.deepEqual(s.gathering, { done: 8, failed: 1, doubles: 2, rankUps: 1, byGrade: { '11': 5, '21': 1, '31': 1 } })
  assert.deepEqual(s.gathered, { '610610013': 6, '610610014': 1, '610610015': 2 })
})

test('runs of one dungeon and mode group together, their gains and deaths summed', () => {
  const vakron = { world: 600072, name: 'Vakron Sky Island', kind: 'conquest', ap: 0, currencies: {} }
  const a = { ...vakron, start: 1, end: 2, kina: 600_000, loot: { '630840002': 14 }, deaths: 1, partyDeaths: 3 }
  const b = { ...vakron, start: 3, end: 4, kina: 600_000, loot: { '630840002': 14 } }
  const fire = { world: 600022, name: 'Fire Temple', kind: 'conquest', start: 5, end: 6, ap: 0, kina: 0, currencies: {} }
  assert.deepEqual(runGroups([a, fire, b]).map((g) => g.length), [2, 1])
  const m = mergeRuns([a, b])
  assert.deepEqual([m.count, m.kina, m.loot, m.deaths, m.partyDeaths, m.start, m.end], [2, 1_200_000, { '630840002': 28 }, 1, 3, 1, 4])
})
