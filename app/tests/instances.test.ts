import assert from 'node:assert/strict'
import test from 'node:test'
import { groupSizeAt, INSTANCES, instanceAt, instanceCeiling, instanceIlvl } from '../src/shared/instances.ts'
import { zoneMode } from '../src/shared/sessions.ts'

test("the catalogue: each kind's instances in the game's order, their cube bosses, modes and item levels", () => {
  assert.deepEqual(
    INSTANCES.expedition.slice(0, 6).map((i) => i.name),
    ['Krao Cave', 'Draupnir', 'Urugugu Canyon', 'Vakron Sky Island', 'Fire Temple', 'Ferocious Horn Den'],
  )
  // Two sub-bosses that unlock the cube's rewards, the final one last (not Silver Blade Rotan; Draupnir's in every mode).
  const fire = INSTANCES.expedition.find((i) => i.name === 'Fire Temple')!
  assert.deepEqual(fire.bosses, ['Red Spark Ignus', 'Black Smoke Murute', "Kromede's Desire"])
  assert.deepEqual(INSTANCES.expedition.find((i) => i.name === 'Draupnir')!.bosses, ['Phantasmal Lakshmi', 'Predator Saraswati', 'Transcendent Bakarma'])
  assert.deepEqual(fire.worlds, { easy: 600021, normal: 600022, advanced: 600023 })
  assert.equal(instanceIlvl(fire, 'normal'), 2100)
  assert.equal(instanceCeiling(fire, 'normal'), 28)
  // Zones to their instance and mode: a Transcendence's stage, a trial's difficulty.
  assert.equal(instanceAt(600055)?.instance.kind, 'transcendence')
  assert.equal(instanceAt(600055)?.mode.id, 's2')
  assert.deepEqual([instanceAt(910023)?.instance.name, instanceAt(910023)?.mode.id], ["Tyrant's Hideout", 'Hard'])
  assert.equal(instanceIlvl(instanceAt(910023)!.instance, 'Hard'), 2000)
  // A run's mode beside its name.
  assert.equal(zoneMode(600022), 'Normal')
  assert.equal(zoneMode(600021), null)
  assert.equal(zoneMode(600055), 'Stage 2')
  assert.equal(zoneMode(600082), 'Normal')
  // A raid's group is ten (two parties), an expedition's five; none out of an instance.
  assert.equal(groupSizeAt(600082), 10)
  assert.equal(groupSizeAt(600022), 5)
  assert.equal(groupSizeAt(1010), null)
})
